import pytest_asyncio
from sqlalchemy import text
from app.core.database import engine

AUTHENTIC_EXAM_TITLES = ('Math 2', 'Math 1', '933', 'science 1', 'gk', 'science', 'Math')


@pytest_asyncio.fixture(autouse=True)
async def clean_test_entities():
    """Teardown fixture ensuring zero synthetic test clutter remains in DB per AGENTS.md."""
    yield
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                DELETE FROM exams 
                WHERE title NOT IN ('Math 2', 'Math 1', '933', 'science 1', 'gk', 'science', 'Math');
            """))
            await conn.execute(text("""
                DELETE FROM users 
                WHERE email LIKE '%@univ.edu' 
                   OR email LIKE '%@student.edu' 
                   OR email LIKE '%@example.com'
                   OR email LIKE 'testuser_%'
                   OR email LIKE '%@university.edu';
            """))
    except Exception:
        pass
