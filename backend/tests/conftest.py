import pytest_asyncio
from sqlalchemy import text
from app.core.database import engine


@pytest_asyncio.fixture(autouse=True)
async def clean_test_entities():
    """
    Teardown fixture ensuring zero synthetic test clutter remains in DB per AGENTS.md.
    Strict Rule: NEVER delete genuine faculty exams (e.g. created by authentic faculty).
    Only clean up exams created by synthetic test users.
    """
    yield
    try:
        async with engine.begin() as conn:
            # Delete only exams created by synthetic/temporary test accounts
            await conn.execute(text("""
                DELETE FROM exams 
                WHERE created_by_id IN (
                    SELECT id FROM users 
                    WHERE email LIKE 'temp_%' 
                       OR email LIKE 'prof_%' 
                       OR email LIKE 'stu_%' 
                       OR email LIKE '%@example.com'
                       OR email LIKE 'testuser_%'
                       OR email LIKE '%@univ.edu'
                       OR email LIKE '%@student.edu'
                );
            """))
            # Delete only synthetic/temporary test users
            await conn.execute(text("""
                DELETE FROM users 
                WHERE email LIKE 'temp_%' 
                   OR email LIKE '%@univ.edu' 
                   OR email LIKE '%@student.edu' 
                   OR email LIKE '%@example.com'
                   OR email LIKE 'testuser_%'
                   OR email LIKE '%@university.edu';
            """))
    except Exception:
        pass
