from collections.abc import Iterator
from datetime import date

from sqlalchemy import (
    Boolean,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    create_engine,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

from docksight.config import get_settings


class Base(DeclarativeBase):
    pass


class Market(Base):
    __tablename__ = "markets"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True)
    name: Mapped[str] = mapped_column(String(64))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)

    properties: Mapped[list["Property"]] = relationship(back_populates="market")


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    market_id: Mapped[int] = mapped_column(ForeignKey("markets.id"), index=True)
    submarket: Mapped[str] = mapped_column(String(64))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    sqft: Mapped[int] = mapped_column(Integer)
    year_built: Mapped[int] = mapped_column(Integer)
    clear_height_ft: Mapped[int] = mapped_column(Integer)
    dock_doors: Mapped[int] = mapped_column(Integer)
    miles_to_highway: Mapped[float] = mapped_column(Float)

    market: Mapped[Market] = relationship(back_populates="properties")
    leases: Mapped[list["Lease"]] = relationship(back_populates="property")


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    industry: Mapped[str] = mapped_column(String(32))
    credit_rating: Mapped[str] = mapped_column(String(4))

    leases: Mapped[list["Lease"]] = relationship(back_populates="tenant")


class Lease(Base):
    __tablename__ = "leases"

    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date, index=True)
    sqft: Mapped[int] = mapped_column(Integer)
    rent_psf: Mapped[float] = mapped_column(Float)
    prior_renewals: Mapped[int] = mapped_column(Integer, default=0)
    # Known only once a lease has reached its end date; None for active leases.
    renewed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    property: Mapped[Property] = relationship(back_populates="leases")
    tenant: Mapped[Tenant] = relationship(back_populates="leases")


class MarketStat(Base):
    __tablename__ = "market_stats"

    market_id: Mapped[int] = mapped_column(ForeignKey("markets.id"), primary_key=True)
    month: Mapped[date] = mapped_column(Date, primary_key=True)
    vacancy_rate: Mapped[float] = mapped_column(Float)
    avg_rent_psf: Mapped[float] = mapped_column(Float)


class Prediction(Base):
    """Batch-scored renewal probabilities for active leases (written by the scoring job)."""

    __tablename__ = "predictions"

    lease_id: Mapped[int] = mapped_column(ForeignKey("leases.id"), primary_key=True)
    model_version: Mapped[str] = mapped_column(String(32))
    renewal_probability: Mapped[float] = mapped_column(Float)
    scored_on: Mapped[date] = mapped_column(Date)


def make_engine(url: str | None = None) -> Engine:
    url = url or get_settings().database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
