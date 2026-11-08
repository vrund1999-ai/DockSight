from datetime import date
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

RiskBand = Literal["high", "medium", "low"]


def risk_band(p: float) -> RiskBand:
    return "high" if p < 0.4 else "medium" if p < 0.65 else "low"


class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class PortfolioSummary(BaseModel):
    as_of: date
    properties: int
    total_sqft: int
    leased_sqft: int
    occupancy: float
    avg_rent_psf: float
    expiring_12m_sqft: int
    expiring_24m_sqft: int
    at_risk_24m_sqft: int
    expected_renewal_rate_24m: float


class ExpiryBucket(BaseModel):
    quarter: str  # e.g. "2027-Q1"
    high: int  # sqft by risk band
    medium: int
    low: int


class MarketSummary(BaseModel):
    code: str
    name: str
    lat: float
    lon: float
    properties: int
    total_sqft: int
    occupancy: float
    market_vacancy: float
    market_rent_psf: float
    rent_growth_yoy: float
    at_risk_24m_sqft: int


class MarketMonth(BaseModel):
    month: date
    vacancy_rate: float
    avg_rent_psf: float


class LeaseRisk(BaseModel):
    lease_id: int
    tenant: str
    industry: str
    credit_rating: str
    property: str
    market: str
    sqft: int
    end_date: date
    months_to_expiry: int
    renewal_probability: float
    risk_band: RiskBand


T = TypeVar("T")


class Page(BaseModel, Generic[T]):  # noqa: UP046 - keep 3.11-compatible generics
    total: int
    items: list[T]


class ContributionOut(BaseModel):
    feature: str
    label: str
    value: float | str
    typical_value: float | str
    impact: float


class LeaseDetail(LeaseRisk):
    start_date: date
    rent_psf: float
    prior_renewals: int
    year_built: int
    clear_height_ft: int
    model_version: str
    drivers: list[ContributionOut]


class ModelInfo(BaseModel):
    version: str
    algorithm: str
    trained_at: str
    metrics: dict[str, float]
