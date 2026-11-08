"""Read and write the portfolio tables."""

import pandas as pd
from sqlalchemy.engine import Engine

from docksight.db import Base
from docksight.pipeline.generate import Portfolio

# Parents before children, so foreign keys are satisfied on insert.
TABLES = ["markets", "market_stats", "properties", "tenants", "leases"]


def write_portfolio(engine: Engine, portfolio: Portfolio) -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for table in TABLES:
            getattr(portfolio, table).to_sql(
                table, conn, if_exists="append", index=False, chunksize=1000
            )


def read_portfolio(engine: Engine) -> Portfolio:
    with engine.connect() as conn:
        return Portfolio(**{t: pd.read_sql_table(t, conn) for t in TABLES})
