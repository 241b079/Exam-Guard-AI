from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.core.redis import close_redis_connection
from app.core.logging import setup_logging, logger

from app.features.auth.router import router as auth_router
from app.features.users.router import router as users_router
from app.features.students.router import router as students_router
from app.features.exams.router import router as exams_router
from app.features.questions.router import router as questions_router
from app.features.attempts.router import router as attempts_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Initializing Database...")
    await init_db()
    logger.info("Database initialized successfully.")
    yield
    logger.info("Shutting down resources...")
    await close_redis_connection()
    logger.info("Shutdown complete.")


app = FastAPI(
    title="Online Examination & Proctoring Platform API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Configure CORS
origins = settings.CORS_ORIGINS
if isinstance(origins, str):
    origins = [origins]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "app": "Online Exam Proctoring API", "environment": settings.APP_ENV}


# API v1 Router Registration
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(students_router, prefix="/api/v1")
app.include_router(exams_router, prefix="/api/v1")
app.include_router(questions_router, prefix="/api/v1")
app.include_router(attempts_router, prefix="/api/v1")
