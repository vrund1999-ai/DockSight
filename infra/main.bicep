// DockSight on Azure Container Apps. See docs/adr/0005-azure-deployment.md.
//
//   web (nginx, public) --/api--> api (FastAPI, internal only) --> Postgres Flexible Server
//   lab (Streamlit, public) -----------------------------------------^
//   pipeline (scheduled job) --> Postgres + model artifact on an Azure Files share (mounted by all)
//
// Deployed by .github/workflows/deploy.yml; every app scales to zero when idle.

@description('Region for all resources.')
param location string = resourceGroup().location

@description('Backend image (API, Model Lab and pipeline job share it).')
param apiImage string

@description('Frontend image (nginx serving the SPA).')
param webImage string

@secure()
@description('Postgres admin password. URL-safe characters only; it is embedded in the connection string.')
param postgresPassword string

@secure()
@description('Signing key for API access tokens.')
param jwtSecret string

@description('Cron schedule (UTC) for the batch pipeline: monthly, after market data closes.')
param pipelineSchedule string = '0 6 1 * *'

var prefix = 'docksight'
var suffix = uniqueString(resourceGroup().id)
var pgAdmin = 'docksight'
var artifactsMount = '/app/artifacts'

// ---------------------------------------------------------------- observability + environment

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

// ---------------------------------------------------------------- model artifact share

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'dsart${suffix}'
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: fileService
  name: 'artifacts'
  properties: { shareQuota: 5 }
}

resource envStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: env
  name: 'artifacts'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: share.name
      accessMode: 'ReadWrite'
    }
  }
}

// ---------------------------------------------------------------- database

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${suffix}'
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: pgAdmin
    administratorLoginPassword: postgresPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Disabled'
    }
  }
}

// Flexible Server rejects concurrent child operations, so these are chained.
resource appDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: 'docksight'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource mlflowDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: 'mlflow'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
  dependsOn: [appDb]
}

// 0.0.0.0 is Azure's special rule for "allow connections from Azure services". Traffic is
// TLS-only and password-authenticated; VNet integration is the next step (see ADR 0005).
resource pgAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: pg
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
  dependsOn: [mlflowDb]
}

// ---------------------------------------------------------------- shared backend config

var pgBase = 'postgresql+psycopg://${pgAdmin}:${postgresPassword}@${pg.properties.fullyQualifiedDomainName}:5432'

var backendSecrets = [
  { name: 'database-url', value: '${pgBase}/${appDb.name}?sslmode=require' }
  { name: 'mlflow-uri', value: '${pgBase}/${mlflowDb.name}?sslmode=require' }
  { name: 'jwt-secret', value: jwtSecret }
]

var backendEnv = [
  { name: 'DOCKSIGHT_DATABASE_URL', secretRef: 'database-url' }
  { name: 'DOCKSIGHT_MLFLOW_TRACKING_URI', secretRef: 'mlflow-uri' }
  { name: 'DOCKSIGHT_JWT_SECRET', secretRef: 'jwt-secret' }
  { name: 'DOCKSIGHT_ARTIFACTS_DIR', value: artifactsMount }
]

// The image runs as uid 10001; SMB mounts are owned by root unless told otherwise.
var artifactsVolume = {
  name: 'artifacts'
  storageType: 'AzureFile'
  storageName: envStorage.name
  mountOptions: 'uid=10001,gid=10001,dir_mode=0750,file_mode=0640,mfsymlinks'
}

var artifactsVolumeMount = {
  volumeName: 'artifacts'
  mountPath: artifactsMount
}

// ---------------------------------------------------------------- apps

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-api'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      // Internal only: reachable from the web app as http://docksight-api, not from the internet.
      ingress: {
        external: false
        targetPort: 8000
        transport: 'http'
        allowInsecure: true
      }
      secrets: backendSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: backendEnv
          volumeMounts: [artifactsVolumeMount]
          probes: [
            {
              type: 'Readiness'
              httpGet: { path: '/api/health', port: 8000 }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
      }
      volumes: [artifactsVolume]
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-web'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
      }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [{ name: 'API_UPSTREAM', value: 'http://${api.name}' }]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
      }
    }
  }
}

resource lab 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-lab'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8501
        transport: 'auto'
      }
      secrets: backendSecrets
    }
    template: {
      containers: [
        {
          name: 'lab'
          image: apiImage
          command: [
            'streamlit'
            'run'
            'streamlit_app.py'
            '--server.port=8501'
            '--server.address=0.0.0.0'
            '--server.headless=true'
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: backendEnv
          volumeMounts: [artifactsVolumeMount]
        }
      ]
      // Streamlit keeps session state in the replica behind a websocket, so a single replica.
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
      volumes: [artifactsVolume]
    }
  }
}

// ---------------------------------------------------------------- batch pipeline

resource pipeline 'Microsoft.App/jobs@2024-03-01' = {
  name: '${prefix}-pipeline'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Schedule'
      scheduleTriggerConfig: {
        cronExpression: pipelineSchedule
        parallelism: 1
        replicaCompletionCount: 1
      }
      replicaTimeout: 1800
      replicaRetryLimit: 1
      secrets: backendSecrets
    }
    template: {
      containers: [
        {
          name: 'pipeline'
          image: apiImage
          command: ['python', '-m', 'docksight.pipeline.run']
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: backendEnv
          volumeMounts: [artifactsVolumeMount]
        }
      ]
      volumes: [artifactsVolume]
    }
  }
  dependsOn: [pgAllowAzure]
}

output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
output labUrl string = 'https://${lab.properties.configuration.ingress.fqdn}'
output pipelineJobName string = pipeline.name
