import os
import getpass
from typing import AsyncGenerator
import asyncpg
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings
from app.core.logging import logger

# Create Async Engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True
)

# Async Session Factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def ensure_database_exists():
    """
    Automatically creates PostgreSQL user role and target database if they do not exist.
    Handles both Docker Compose and local PostgreSQL instances seamlessly.
    Uses 'TEMPLATE template0' to avoid template1 lock contention errors.
    """
    try:
        url = make_url(settings.DATABASE_URL)
        target_db = url.database
        target_user = url.username or "user"
        target_password = url.password or "password"
        host = url.host or "localhost"
        port = url.port or 5432

        if not target_db:
            return

        current_os_user = getpass.getuser()

        # Admin credentials to attempt connecting to default 'postgres' database
        admin_credentials = [
            (target_user, target_password, "postgres"),
            ("postgres", "password", "postgres"),
            ("postgres", "postgres", "postgres"),
            ("postgres", "", "postgres"),
            (current_os_user, "", "postgres"),
        ]

        conn = None
        for admin_user, admin_pass, admin_db in admin_credentials:
            try:
                conn = await asyncpg.connect(
                    user=admin_user,
                    password=admin_pass,
                    host=host,
                    port=port,
                    database=admin_db,
                    timeout=3
                )
                if conn:
                    break
            except Exception:
                continue

        if conn:
            try:
                # 1. Ensure target role exists
                role_exists = await conn.fetchval(
                    "SELECT 1 FROM pg_roles WHERE rolname=$1", target_user
                )
                if not role_exists:
                    logger.info(f"Creating missing PostgreSQL role '{target_user}'...")
                    await conn.execute(
                        f"CREATE ROLE \"{target_user}\" WITH LOGIN SUPERUSER PASSWORD '{target_password}';"
                    )
                    logger.info(f"Role '{target_user}' created successfully.")

                # 2. Ensure target database exists
                db_exists = await conn.fetchval(
                    "SELECT 1 FROM pg_database WHERE datname=$1", target_db
                )
                if not db_exists:
                    logger.info(f"Creating missing PostgreSQL database '{target_db}'...")
                    await conn.execute(
                        f'CREATE DATABASE "{target_db}" WITH OWNER "{target_user}" TEMPLATE template0;'
                    )
                    logger.info(f"Database '{target_db}' created successfully.")
            finally:
                await conn.close()
    except Exception as e:
        logger.error(f"Automatic database setup error: {e}")
        raise e


async def init_db():
    await ensure_database_exists()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
