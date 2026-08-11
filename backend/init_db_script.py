import asyncio
from app.core.database import init_db
from app.core.logging import logger, setup_logging

async def main():
    setup_logging()
    logger.info("Running automatic database & table creation script...")
    await init_db()
    logger.info("Database setup completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
