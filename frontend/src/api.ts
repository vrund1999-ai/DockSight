// Typed client for the DockSight API. Types mirror backend/docksight/api/schemas.py.

export type RiskBand = "high" | "medium" | "low";

export interface PortfolioSummary {
  as_of: string;
  properties: number;
  total_sqft: number;
  leased_sqft: number;
  occupancy: number;
  avg_rent_psf: number;
  expiring_12m_sqft: number;
  expiring_24m_sqft: number;
  at_risk_24m_sqft: number;
  expected_renewal_rate_24m: number;
}

export interface ExpiryBucket {
  quarter: string;
  high: number;
  medium: number;
  low: number;
}

export interface MarketSummary {
  code: string;
  name: string;
  lat: number;
  lon: number;
  properties: number;
  total_sqft: number;
  occupancy: number;
  market_vacancy: number;
  market_rent_psf: number;
  rent_growth_yoy: number;
  at_risk_24m_sqft: number;
}

export interface MarketMonth {
  month: string;
  vacancy_rate: number;
  avg_rent_psf: number;
}

export interface LeaseRisk {
  lease_id: number;
  tenant: string;
  industry: string;
  credit_rating: string;
  property: string;
  market: string;
  sqft: number;
  end_date: string;
  months_to_expiry: number;
  renewal_probability: number;
  risk_band: RiskBand;
}

export interface Page<T> {
  total: number;
  items: T[];
}

export interface Driver {
  feature: string;
  label: string;
  value: number | string;
  typical_value: number | string;
  impact: number;
}

export interface LeaseDetail extends LeaseRisk {
  start_date: string;
  rent_psf: number;
  prior_renewals: number;
  year_built: number;
  clear_height_ft: number;
  model_version: string;
  drivers: Driver[];
}

export interface ModelInfo {
  version: string;
  algorithm: string;
  trained_at: string;
  metrics: Record<string, number>;
}

export interface LeaseQuery {
  months: number;
  market?: string;
  band?: RiskBand;
  sort: "risk" | "expiry" | "sqft";
  limit: number;
  offset: number;
}

const TOKEN_KEY = "docksight.token";

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && token) {
    tokenStore.clear();
    window.dispatchEvent(new Event("docksight:logout"));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function qs(params: object): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ access_token: string }>("/api/auth/token", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  summary: () => request<PortfolioSummary>("/api/portfolio/summary"),
  expirySchedule: (market?: string) =>
    request<ExpiryBucket[]>(`/api/portfolio/expiry-schedule?${qs({ months: 24, market })}`),
  markets: () => request<MarketSummary[]>("/api/markets"),
  marketHistory: (code: string) => request<MarketMonth[]>(`/api/markets/${code}/history`),
  expiringLeases: (q: LeaseQuery) => request<Page<LeaseRisk>>(`/api/leases/expiring?${qs(q)}`),
  lease: (id: number) => request<LeaseDetail>(`/api/leases/${id}`),
  model: () => request<ModelInfo>("/api/model"),
};
