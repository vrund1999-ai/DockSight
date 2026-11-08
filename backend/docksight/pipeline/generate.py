"""Synthetic portfolio generator.

Produces a realistic-looking last-mile industrial portfolio: markets with monthly rent/vacancy
history, warehouse properties, tenants, and chains of leases per suite. Lease renewal outcomes are
drawn from a hidden logistic "ground truth" so the ML model has real signal to learn, plus noise
so it can't be perfect.

Everything is deterministic for a given seed.
"""

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

AS_OF = date(2026, 10, 1)  # The "today" of the dataset; leases ending after this are active.
HISTORY_START = date(2014, 1, 1)
ANNUAL_ESCALATION = 0.035  # Contractual annual rent bump applied to every lease.

MARKETS = [
    # code, name, lat, lon, base rent $/sf/yr in 2014, base vacancy
    ("NYC", "New York / New Jersey", 40.73, -74.17, 9.5, 0.045),
    ("ATL", "Atlanta", 33.75, -84.39, 4.6, 0.070),
    ("DAL", "Dallas-Fort Worth", 32.78, -96.80, 4.8, 0.075),
    ("PHL", "Philadelphia", 40.00, -75.20, 5.6, 0.060),
    ("CHI", "Chicago", 41.88, -87.63, 5.2, 0.065),
    ("LAX", "Los Angeles / Inland Empire", 34.06, -117.60, 8.8, 0.030),
    ("MIA", "Miami", 25.80, -80.30, 8.0, 0.040),
    ("SEA", "Seattle", 47.40, -122.25, 7.9, 0.045),
]

INDUSTRIES = {
    # industry: renewal propensity shift (log-odds)
    "3PL": -0.15,
    "E-commerce": -0.35,
    "Food & Beverage": 0.35,
    "Building Materials": 0.20,
    "Consumer Goods": 0.0,
    "Healthcare": 0.30,
    "Auto Parts": 0.10,
}
LEASE_TERMS = [36, 48, 60, 84, 120]  # months
LEASE_TERM_WEIGHTS = [0.2, 0.15, 0.45, 0.12, 0.08]
CREDIT_RATINGS = ["A", "BBB", "BB", "B", "NR"]
CREDIT_SCORE = {"A": 4, "BBB": 3, "BB": 2, "B": 1, "NR": 0}

_PREFIXES = [
    "Apex",
    "Northline",
    "Harbor",
    "Summit",
    "Bluewater",
    "Ironwood",
    "Keystone",
    "Lakeside",
    "Meridian",
    "Pioneer",
    "Redline",
    "Silverleaf",
    "Trident",
    "Vantage",
    "Wayfarer",
    "Cobalt",
    "Granite",
    "Horizon",
    "Juniper",
    "Orchard",
]
_SUFFIXES = {
    "3PL": ["Logistics", "Fulfillment", "Freight"],
    "E-commerce": ["Direct", "Online", "Marketplace"],
    "Food & Beverage": ["Foods", "Provisions", "Beverage Co."],
    "Building Materials": ["Supply", "Building Products", "Lumber"],
    "Consumer Goods": ["Brands", "Home Goods", "Outfitters"],
    "Healthcare": ["Medical", "Health Supply", "Pharma Distribution"],
    "Auto Parts": ["Auto Parts", "Motor Supply", "Fleet Parts"],
}
_STREETS = [
    "Commerce",
    "Industrial",
    "Port",
    "Distribution",
    "Freight",
    "Terminal",
    "Logistics",
    "Gateway",
    "Rail",
    "Dock",
    "Enterprise",
    "Corporate",
]


@dataclass
class Portfolio:
    markets: pd.DataFrame
    market_stats: pd.DataFrame
    properties: pd.DataFrame
    tenants: pd.DataFrame
    leases: pd.DataFrame


def _months(start: date, end: date) -> list[date]:
    return [d.date() for d in pd.date_range(start, end, freq="MS")]


def _add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    return date(d.year + y, m + 1, 1)


def _cycle(t: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """National industrial cycle: steady growth, a 2021-22 e-commerce boom, then a cooldown.

    Returns (rent_multiplier, vacancy_shift) for fractional years t since 2014.
    """
    boom = np.clip(t - 7.0, 0, 2.0)  # 2021-2022
    cool = np.clip(t - 9.0, 0, None)  # 2023+
    rent = np.exp(0.045 * t + 0.11 * boom - 0.055 * cool)
    vacancy = -0.012 * boom + 0.014 * np.minimum(cool, 2.5)
    return rent, vacancy


def generate(seed: int = 42, n_properties: int = 800, as_of: date = AS_OF) -> Portfolio:
    rng = np.random.default_rng(seed)
    months = _months(HISTORY_START, as_of)
    t = np.array([(m.year - 2014) + (m.month - 1) / 12 for m in months])
    cycle_rent, cycle_vac = _cycle(t)

    # --- Markets and monthly market stats ---------------------------------------------------
    markets = pd.DataFrame(
        [(i + 1, c, n, la, lo) for i, (c, n, la, lo, _, _) in enumerate(MARKETS)],
        columns=["id", "code", "name", "lat", "lon"],
    )
    stats_rows = []
    for i, (_, _, _, _, base_rent, base_vac) in enumerate(MARKETS):
        mkt_growth = rng.normal(0, 0.008)  # Some markets outgrow others.
        noise_r = np.cumsum(rng.normal(0, 0.004, len(months)))
        noise_v = np.convolve(rng.normal(0, 0.003, len(months)), np.ones(6) / 6, mode="same")
        rent = base_rent * cycle_rent * np.exp(mkt_growth * t + noise_r)
        vac = np.clip(base_vac + cycle_vac * rng.uniform(0.7, 1.4) + noise_v, 0.01, 0.2)
        stats_rows += [
            (i + 1, m, round(float(v), 4), round(float(r), 2))
            for m, r, v in zip(months, rent, vac, strict=True)
        ]
    market_stats = pd.DataFrame(
        stats_rows, columns=["market_id", "month", "vacancy_rate", "avg_rent_psf"]
    )
    stat_lookup = market_stats.set_index(["market_id", "month"])

    # --- Properties -------------------------------------------------------------------------
    weights = np.array([0.2, 0.13, 0.14, 0.12, 0.14, 0.12, 0.07, 0.08])
    prop_market = rng.choice(len(MARKETS), size=n_properties, p=weights / weights.sum())
    properties = []
    for pid, mi in enumerate(prop_market, start=1):
        code, _, lat, lon = MARKETS[mi][:4]
        year_built = int(np.clip(rng.normal(1995, 16), 1965, 2024))
        modern = year_built >= 2005
        sqft = int(np.clip(rng.lognormal(np.log(85_000), 0.55), 15_000, 600_000) // 500 * 500)
        properties.append(
            {
                "id": pid,
                "name": f"{int(rng.integers(10, 9999))} {rng.choice(_STREETS)} "
                f"{rng.choice(['Dr', 'Blvd', 'Way', 'Pkwy', 'Ave'])}",
                "market_id": mi + 1,
                "submarket": f"{code}-{rng.choice(['North', 'South', 'East', 'West', 'Central'])}",
                "lat": round(lat + rng.normal(0, 0.18), 5),
                "lon": round(lon + rng.normal(0, 0.22), 5),
                "sqft": sqft,
                "year_built": year_built,
                "clear_height_ft": int(
                    rng.choice([28, 32, 36, 40]) if modern else rng.choice([18, 20, 22, 24, 26])
                ),
                "dock_doors": max(2, int(sqft / 10_000 * rng.uniform(0.8, 1.6))),
                "miles_to_highway": round(float(rng.gamma(2.0, 0.9)), 2),
            }
        )
    properties = pd.DataFrame(properties)

    # --- Tenants (created lazily as suites need them) ---------------------------------------
    tenants: list[dict] = []

    def new_tenant() -> dict:
        industry = str(rng.choice(list(INDUSTRIES)))
        rating = str(rng.choice(CREDIT_RATINGS, p=[0.12, 0.28, 0.3, 0.18, 0.12]))
        tenant = {
            "id": len(tenants) + 1,
            "name": f"{rng.choice(_PREFIXES)} {rng.choice(_SUFFIXES[industry])}",
            "industry": industry,
            "credit_rating": rating,
        }
        tenants.append(tenant)
        return tenant

    # --- Lease chains -----------------------------------------------------------------------
    leases: list[dict] = []
    for prop in properties.itertuples():
        n_suites = 1 if prop.sqft < 60_000 else int(rng.integers(1, 4))
        suite_sizes = rng.dirichlet(np.ones(n_suites) * 3) * prop.sqft
        quality = (
            0.06 * (prop.clear_height_ft - 26) / 4
            - 0.035 * prop.miles_to_highway
            - 0.004 * (2014 - prop.year_built) / 5
        )
        for suite_sqft in suite_sizes:
            suite_sqft = int(suite_sqft // 500 * 500) or 500
            start = _add_months(HISTORY_START, int(rng.integers(-60, 36)))
            tenant = new_tenant()
            prior = 0
            while start <= as_of:
                term = int(rng.choice(LEASE_TERMS, p=LEASE_TERM_WEIGHTS))
                end = _add_months(start, term)
                start_key = max(start, HISTORY_START)
                mkt_rent = stat_lookup.loc[(prop.market_id, start_key), "avg_rent_psf"]
                rent = float(mkt_rent * np.exp(quality + rng.normal(0, 0.06)))
                lease = {
                    "id": len(leases) + 1,
                    "property_id": prop.id,
                    "tenant_id": tenant["id"],
                    "start_date": start,
                    "end_date": end,
                    "sqft": suite_sqft,
                    "rent_psf": round(rent, 2),
                    "prior_renewals": prior,
                    "renewed": None,
                }
                leases.append(lease)
                if end > as_of:
                    break  # Active lease: outcome not yet known.

                # Hidden ground truth for the renewal decision, evaluated at expiry.
                stat = stat_lookup.loc[(prop.market_id, max(end, HISTORY_START))]
                in_place = rent * (1 + ANNUAL_ESCALATION) ** (term / 12)
                rent_gap = np.log(in_place / (stat.avg_rent_psf * np.exp(quality)))
                credit = CREDIT_SCORE[tenant["credit_rating"]]
                logit = (
                    0.6
                    - 5.0 * rent_gap  # Paying above market -> shop around.
                    - 6.0 * max(rent_gap - 0.08, 0)  # ...and well above market -> leave.
                    - 3.0 * rent_gap * (credit <= 1)  # Weak-credit tenants are price-sensitive.
                    - 25.0 * (stat.vacancy_rate - 0.05)  # Loose market -> more options.
                    + 0.3 * (credit - 2)
                    + 1.5 * INDUSTRIES[tenant["industry"]]
                    + 0.45 * min(prior, 3)  # Sticky tenants stay sticky.
                    + 0.006 * (term - 60)
                    + 0.07 * (prop.clear_height_ft - 26)
                    - 0.2 * prop.miles_to_highway
                    - 0.35 * (suite_sqft < 25_000)
                    + rng.normal(0, 0.5)  # Things the data can't see.
                )
                renewed = bool(rng.random() < 1 / (1 + np.exp(-logit)))
                lease["renewed"] = renewed

                if renewed:
                    prior += 1
                    start = end
                else:
                    prior = 0
                    tenant = new_tenant()
                    start = _add_months(end, int(rng.integers(0, 10)))  # Downtime between tenants.

    return Portfolio(
        markets=markets,
        market_stats=market_stats,
        properties=properties,
        tenants=pd.DataFrame(tenants),
        leases=pd.DataFrame(leases),
    )
