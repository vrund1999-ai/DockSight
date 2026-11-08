from datetime import date
from typing import Annotated, Literal

import pandas as pd
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session

from docksight.api import schemas
from docksight.api.security import authenticate, current_user, issue_token
from docksight.config import Settings, get_settings
from docksight.db import Lease, Market, MarketStat, Prediction, Property, Tenant, get_session
from docksight.ml.explain import explain
from docksight.ml.features import build_features
from docksight.ml.model import load_artifact
from docksight.pipeline.generate import AS_OF

HIGH_RISK_BELOW = 0.4

DB = Annotated[Session, Depends(get_session)]

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])
router = APIRouter(prefix="/api", dependencies=[Depends(current_user)])


def _horizon(months: int) -> date:
    """Exclusive upper bound: "within 24 months" of 2026-10-01 means end_date < 2028-10-01."""
    return AS_OF + relativedelta(months=months)


def _months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


@auth_router.post("/token", response_model=schemas.Token)
def login(body: schemas.LoginRequest, settings: Annotated[Settings, Depends(get_settings)]):
    if not authenticate(body.username, body.password, settings):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    token, ttl = issue_token(body.username, settings)
    return schemas.Token(access_token=token, expires_in=ttl)


# --- Portfolio and markets -------------------------------------------------------------------


@router.get("/portfolio/summary", response_model=schemas.PortfolioSummary, tags=["portfolio"])
def portfolio_summary(db: DB):
    n_props, total_sqft = db.execute(select(func.count(Property.id), func.sum(Property.sqft))).one()

    active = Lease.renewed.is_(None)
    exp_12 = Lease.end_date < _horizon(12)
    exp_24 = Lease.end_date < _horizon(24)

    def sqft_where(cond):
        return func.coalesce(func.sum(case((cond, Lease.sqft), else_=0)), 0)

    row = db.execute(
        select(
            func.sum(Lease.sqft).label("leased"),
            (func.sum(Lease.rent_psf * Lease.sqft) / func.sum(Lease.sqft)).label("rent"),
            sqft_where(exp_12).label("exp12"),
            sqft_where(exp_24).label("exp24"),
            sqft_where(exp_24 & (Prediction.renewal_probability < HIGH_RISK_BELOW)).label("risk"),
            func.sum(case((exp_24, Prediction.renewal_probability * Lease.sqft), else_=0)).label(
                "expected"
            ),
        )
        .join(Prediction, Prediction.lease_id == Lease.id)
        .where(active)
    ).one()

    return schemas.PortfolioSummary(
        as_of=AS_OF,
        properties=n_props,
        total_sqft=total_sqft,
        leased_sqft=row.leased,
        occupancy=round(row.leased / total_sqft, 4),
        avg_rent_psf=round(row.rent, 2),
        expiring_12m_sqft=row.exp12,
        expiring_24m_sqft=row.exp24,
        at_risk_24m_sqft=row.risk,
        expected_renewal_rate_24m=round(row.expected / row.exp24, 4) if row.exp24 else 0.0,
    )


@router.get(
    "/portfolio/expiry-schedule", response_model=list[schemas.ExpiryBucket], tags=["portfolio"]
)
def expiry_schedule(
    db: DB,
    months: Annotated[int, Query(ge=3, le=60)] = 24,
    market: Annotated[str | None, Query(max_length=8)] = None,
):
    """Square feet expiring per quarter, split by renewal-risk band (the "expiry wall")."""
    q = (
        select(Lease.end_date, Lease.sqft, Prediction.renewal_probability)
        .join(Prediction, Prediction.lease_id == Lease.id)
        .where(Lease.end_date < _horizon(months))
    )
    if market:
        q = (
            q.join(Property, Property.id == Lease.property_id)
            .join(Market, Market.id == Property.market_id)
            .where(Market.code == market.upper())
        )

    buckets: dict[str, dict[str, int]] = {}
    cursor = AS_OF
    while cursor < _horizon(months):  # Pre-fill so empty quarters still render.
        buckets.setdefault(_quarter(cursor), {"high": 0, "medium": 0, "low": 0})
        cursor += relativedelta(months=3)
    for end, sqft, p in db.execute(q):
        bucket = buckets.setdefault(_quarter(end), {"high": 0, "medium": 0, "low": 0})
        bucket[schemas.risk_band(p)] += sqft
    return [schemas.ExpiryBucket(quarter=k, **v) for k, v in sorted(buckets.items())]


def _quarter(d: date) -> str:
    return f"{d.year}-Q{(d.month - 1) // 3 + 1}"


@router.get("/markets", response_model=list[schemas.MarketSummary], tags=["markets"])
def markets(db: DB):
    latest = db.scalar(select(func.max(MarketStat.month)))
    year_ago = latest - relativedelta(months=12)

    props = (
        select(
            Property.market_id,
            func.count(Property.id).label("n"),
            func.sum(Property.sqft).label("sqft"),
        )
        .group_by(Property.market_id)
        .subquery()
    )
    leased = (
        select(
            Property.market_id,
            func.sum(Lease.sqft).label("leased"),
            func.sum(
                case(
                    (
                        (Lease.end_date < _horizon(24))
                        & (Prediction.renewal_probability < HIGH_RISK_BELOW),
                        Lease.sqft,
                    ),
                    else_=0,
                )
            ).label("risk"),
        )
        .join(Lease, Lease.property_id == Property.id)
        .join(Prediction, Prediction.lease_id == Lease.id)
        .where(Lease.renewed.is_(None))
        .group_by(Property.market_id)
        .subquery()
    )
    now, prev = MarketStat.__table__.alias("now"), MarketStat.__table__.alias("prev")
    rows = db.execute(
        select(
            Market,
            props.c.n,
            props.c.sqft,
            leased.c.leased,
            leased.c.risk,
            now.c.vacancy_rate,
            now.c.avg_rent_psf,
            prev.c.avg_rent_psf.label("prev_rent"),
        )
        .join(props, props.c.market_id == Market.id)
        .join(leased, leased.c.market_id == Market.id)
        .join(now, (now.c.market_id == Market.id) & (now.c.month == latest))
        .join(prev, (prev.c.market_id == Market.id) & (prev.c.month == year_ago))
        .order_by(props.c.sqft.desc())
    ).all()

    return [
        schemas.MarketSummary(
            code=m.code,
            name=m.name,
            lat=m.lat,
            lon=m.lon,
            properties=n,
            total_sqft=sqft,
            occupancy=round(lsqft / sqft, 4),
            market_vacancy=vac,
            market_rent_psf=rent,
            rent_growth_yoy=round(rent / prev_rent - 1, 4),
            at_risk_24m_sqft=risk,
        )
        for m, n, sqft, lsqft, risk, vac, rent, prev_rent in rows
    ]


@router.get("/markets/{code}/history", response_model=list[schemas.MarketMonth], tags=["markets"])
def market_history(code: str, db: DB):
    market = db.scalar(select(Market).where(Market.code == code.upper()))
    if market is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown market {code!r}")
    return db.scalars(
        select(MarketStat).where(MarketStat.market_id == market.id).order_by(MarketStat.month)
    ).all()


# --- Leases ----------------------------------------------------------------------------------


def _lease_risk_query() -> Select:
    return (
        select(Lease, Tenant, Property, Market.code, Prediction.renewal_probability)
        .join(Prediction, Prediction.lease_id == Lease.id)
        .join(Tenant, Tenant.id == Lease.tenant_id)
        .join(Property, Property.id == Lease.property_id)
        .join(Market, Market.id == Property.market_id)
    )


def _to_risk(lease: Lease, tenant: Tenant, prop: Property, code: str, p: float) -> dict:
    return dict(
        lease_id=lease.id,
        tenant=tenant.name,
        industry=tenant.industry,
        credit_rating=tenant.credit_rating,
        property=prop.name,
        market=code,
        sqft=lease.sqft,
        end_date=lease.end_date,
        months_to_expiry=_months_between(AS_OF, lease.end_date),
        renewal_probability=p,
        risk_band=schemas.risk_band(p),
    )


_SORTS = {
    "risk": Prediction.renewal_probability.asc(),
    "expiry": Lease.end_date.asc(),
    "sqft": Lease.sqft.desc(),
}
_BANDS = {"high": (0.0, 0.4), "medium": (0.4, 0.65), "low": (0.65, 1.01)}


@router.get("/leases/expiring", response_model=schemas.Page[schemas.LeaseRisk], tags=["leases"])
def expiring_leases(
    db: DB,
    months: Annotated[int, Query(ge=1, le=120)] = 24,
    market: Annotated[str | None, Query(max_length=8)] = None,
    band: schemas.RiskBand | None = None,
    sort: Literal["risk", "expiry", "sqft"] = "risk",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    q = _lease_risk_query().where(Lease.end_date < _horizon(months))
    if market:
        q = q.where(Market.code == market.upper())
    if band:
        lo, hi = _BANDS[band]
        q = q.where(Prediction.renewal_probability >= lo, Prediction.renewal_probability < hi)

    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.execute(q.order_by(_SORTS[sort], Lease.id).limit(limit).offset(offset)).all()
    return schemas.Page[schemas.LeaseRisk](
        total=total, items=[schemas.LeaseRisk(**_to_risk(*r)) for r in rows]
    )


@router.get("/leases/{lease_id}", response_model=schemas.LeaseDetail, tags=["leases"])
def lease_detail(lease_id: int, db: DB):
    row = db.execute(_lease_risk_query().where(Lease.id == lease_id)).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lease not found or not active")
    lease, tenant, prop, code, _ = row

    stats = pd.read_sql(
        select(MarketStat).where(MarketStat.market_id == prop.market_id), db.connection()
    )
    features = build_features(
        leases=_frame(
            lease,
            [
                "id",
                "property_id",
                "tenant_id",
                "start_date",
                "end_date",
                "sqft",
                "rent_psf",
                "prior_renewals",
                "renewed",
            ],
        ),
        properties=_frame(
            prop,
            [
                "id",
                "market_id",
                "sqft",
                "year_built",
                "clear_height_ft",
                "dock_doors",
                "miles_to_highway",
            ],
        ),
        tenants=_frame(tenant, ["id", "industry", "credit_rating"]),
        markets=pd.DataFrame([{"id": prop.market_id, "code": code}]),
        market_stats=stats,
        as_of=AS_OF,
    )
    artifact = load_artifact()
    # Explain from live features so the drivers always agree with the probability shown.
    p, drivers = explain(artifact, features.iloc[0])

    return schemas.LeaseDetail(
        **_to_risk(lease, tenant, prop, code, round(p, 4)),
        start_date=lease.start_date,
        rent_psf=lease.rent_psf,
        prior_renewals=lease.prior_renewals,
        year_built=prop.year_built,
        clear_height_ft=prop.clear_height_ft,
        model_version=artifact.version,
        drivers=[schemas.ContributionOut(**vars(d)) for d in drivers],
    )


def _frame(obj: object, cols: list[str]) -> pd.DataFrame:
    return pd.DataFrame([{c: getattr(obj, c) for c in cols}])


@router.get("/model", response_model=schemas.ModelInfo, tags=["model"])
def model_info():
    a = load_artifact()
    return schemas.ModelInfo(
        version=a.version, algorithm=a.algorithm, trained_at=a.trained_at, metrics=a.metrics
    )
