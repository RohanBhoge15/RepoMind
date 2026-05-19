"""
Database connection and session management.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import event, text
import logging
from config import get_settings

settings = get_settings()

# Create sync database engine with production-ready pool settings
engine = create_engine(
    settings.database_url,
    pool_size=20,
    max_overflow=50,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_timeout=30,
    echo=False
)

# Add connection health check
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Set connection parameters."""
    # For PostgreSQL, we can set statement timeout, etc.
    pass

@event.listens_for(engine, "checkout")
def receive_checkout(connection, record, connection_proxy):
    """Log connection checkout (debugging)."""
    logging.debug(f"Connection checked out: {connection}")

# Create sync session factory
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False
)

# Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency function to get database session.
    Yields a session and ensures it's closed after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database tables.
    """
    Base.metadata.create_all(bind=engine)
