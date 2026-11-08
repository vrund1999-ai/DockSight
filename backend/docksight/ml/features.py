"""Feature engineering shared by training, batch scoring, the API, and the Streamlit lab.

Keeping one implementation is deliberate: training/serving skew is one of the most common ways
ML features silently break in production.

Leakage guard: market conditions are snapshotted 12 months *before* lease expiry, which is when
asset managers actually start renewal conversations. At training time we could peek at market
conditions on the expiry date, but we will never have those for leases we score today.
"""

from datetime import date

import numpy as np
import pandas as pd

from docksight.pipeline.generate import ANNUAL_ESCALATION, CREDIT_SCORE

DECISION_LEAD_MONTHS = 12

NUMERIC_FEATURES = [
    "term_months",
    "log_sqft",
    "rent_to_market",
    "market_vacancy",
    "market_rent_growth_12m",
    "prior_renewals",
    "building_age",
    "clear_height_ft",
    "docks_per_10k_sf",
    "miles_to_highway",
    "credit_score",
]
CATEGORICAL_FEATURES = ["industry", "market_code"]
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

FEATURE_LABELS = {
    "term_months": "Lease term",
    "log_sqft": "Suite size",
    "rent_to_market": "Rent vs. market",
    "market_vacancy": "Market vacancy",
    "market_rent_growth_12m": "Market rent growth (12m)",
    "prior_renewals": "Prior renewals",
    "building_age": "Building age",
    "clear_height_ft": "Clear height",
    "docks_per_10k_sf": "Dock door density",
    "miles_to_highway": "Distance to highway",
    "credit_score": "Tenant credit",
    "industry": "Tenant industry",
    "market_code": "Market",
}


def _month_floor(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s).dt.to_period("M").dt.to_timestamp()


def build_features(
    leases: pd.DataFrame,
    properties: pd.DataFrame,
    tenants: pd.DataFrame,
    markets: pd.DataFrame,
    market_stats: pd.DataFrame,
    as_of: date,
) -> pd.DataFrame:
    """Return one row per lease with model features, plus `lease_id`, `end_date`, `renewed`."""
    stats = market_stats.copy()
    stats["month"] = _month_floor(stats["month"])
    stats = stats.sort_values(["market_id", "month"])
    stats["rent_12m_ago"] = stats.groupby("market_id")["avg_rent_psf"].shift(12)
    first_month, last_month = stats["month"].min(), stats["month"].max()

    df = (
        leases.rename(columns={"id": "lease_id", "sqft": "lease_sqft"})
        .merge(properties.rename(columns={"id": "property_id"}), on="property_id")
        .merge(tenants.rename(columns={"id": "tenant_id"}), on="tenant_id")
        .merge(
            markets[["id", "code"]].rename(columns={"id": "market_id", "code": "market_code"}),
            on="market_id",
        )
    )
    start = pd.to_datetime(df["start_date"])
    end = pd.to_datetime(df["end_date"])

    snapshot = _month_floor(end - pd.DateOffset(months=DECISION_LEAD_MONTHS))
    snapshot = snapshot.clip(lower=first_month, upper=min(last_month, pd.Timestamp(as_of)))
    df["snapshot_month"] = snapshot
    df = df.merge(
        stats[["market_id", "month", "vacancy_rate", "avg_rent_psf", "rent_12m_ago"]],
        left_on=["market_id", "snapshot_month"],
        right_on=["market_id", "month"],
        how="left",
    )

    term_months = ((end.dt.year - start.dt.year) * 12 + (end.dt.month - start.dt.month)).to_numpy()
    in_place_at_expiry = df["rent_psf"] * (1 + ANNUAL_ESCALATION) ** (term_months / 12)

    out = pd.DataFrame(
        {
            "lease_id": df["lease_id"],
            "end_date": pd.to_datetime(df["end_date"]).dt.date,
            "renewed": df["renewed"],
            "term_months": term_months,
            "log_sqft": np.log(df["lease_sqft"].clip(lower=1)),
            "rent_to_market": in_place_at_expiry / df["avg_rent_psf"],
            "market_vacancy": df["vacancy_rate"],
            "market_rent_growth_12m": (df["avg_rent_psf"] / df["rent_12m_ago"] - 1).fillna(0.0),
            "prior_renewals": df["prior_renewals"],
            "building_age": pd.to_datetime(df["end_date"]).dt.year - df["year_built"],
            "clear_height_ft": df["clear_height_ft"],
            "docks_per_10k_sf": df["dock_doors"] / (df["sqft"] / 10_000),
            "miles_to_highway": df["miles_to_highway"],
            "credit_score": df["credit_rating"].map(CREDIT_SCORE).fillna(0),
            "industry": df["industry"],
            "market_code": df["market_code"],
        }
    )
    return out.sort_values("lease_id").reset_index(drop=True)
