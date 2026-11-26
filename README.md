# Online Examination Portal with Automated Proctoring System

ExamGuard AI is a web application for creating, conducting, monitoring, and evaluating online exams. Students use one portal to take exams and view their attempt history. Faculty author exams, monitor live attempts, grade answers, and review integrity evidence. Administrators have separate views for system activity and management.

## What the portal does

| Role | Workflow |
| --- | --- |
| Student | Complete a profile and register a photo, open an eligible exam, complete identity and media checks, answer questions with autosave, resume eligible attempts, submit, and view released results or appeal an eligible disqualification. |
| Faculty | Configure schedules and attempt policies, author or import questions, publish exams, manage students and batches, grant re-exams, monitor candidates, review evidence, grade short answers, and manage result publication and appeals. |
| Admin | View system telemetry and manage users, students, exams, monitoring, and settings through the admin portal. |

The exam engine supports MCQs and short answers, automatic MCQ scoring, faculty grading, configurable negative marking, and a persisted deadline for timed attempts. It tracks evaluation, examination integrity, and result publication separately.

During an exam, the portal samples webcam frames for face and identity checks, tracks browser and media state, and runs browser-side voice activity and environment checks. A shared screen can supply periodic and event-triggered evidence snapshots. Live media can use LiveKit when configured or the application's peer-to-peer WebRTC path. Exam-room WebSockets carry presence, signaling, and monitoring updates.

The integrity pipeline groups related observations into incidents, tracks risk per attempt, and prepares an investigation after submission. Low-risk attempts can be cleared automatically, with publication governed by exam policy. A verdict labelled `AUTO_DISQUALIFIED` packages evidence for urgent faculty review. Eligible final disqualifications can be appealed through the student portal.

## Stack and code layout

| Layer | Implementation |
| --- | --- |
| Web application | Next.js 14 App Router, React 18, TypeScript, and Tailwind CSS in [frontend](frontend) |
| API | FastAPI, Pydantic, and async SQLAlchemy in [backend/app](backend/app) |
| Persistence | PostgreSQL 16, Redis 7 for refresh-token state, and filesystem storage for uploads and evidence |
| Media and vision | Browser media APIs and WebRTC, LiveKit SFU, OpenCV with YuNet and SFace for identity, and NanoDet integration for object signals |

- [Architecture and implementation](docs/ARCHITECTURE.md)
- [Cross-device verification](docs/CROSS_DEVICE_TESTING.md)
- [Repository testing and data protection rules](AGENTS.md)

## Setup

### Prerequisites

- **Python** 3.10+
- **Node.js** 18+ and **npm**
- **Docker** and **Docker Compose** (for PostgreSQL 16, Redis 7, and LiveKit)

### 1. Start infrastructure services

From the repository root, start PostgreSQL, Redis, and the development LiveKit SFU server:

```sh
docker compose up -d
```

Verify the containers are healthy:

```sh
docker compose ps
```

| Service | Container | Port(s) |
| --- | --- | --- |
| PostgreSQL 16 | `exam_proctoring_postgres` | `5432` |
| Redis 7 | `exam_proctoring_redis` | `6379` |
| LiveKit SFU | `exam_proctoring_livekit` | `7880`, `7881`, `7882/udp` |

### 2. Backend setup

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp -n .env.example .env
```

Review `backend/.env` before starting:
- `DATABASE_URL`: PostgreSQL asyncpg connection string (defaults to `postgresql+asyncpg://user:password@localhost:5432/online_exam`, matching `docker-compose.yml`).
- `REDIS_URL`: Redis connection string (defaults to `redis://localhost:6379`).
- `SECRET_KEY`: JWT signing key (replace the development value in non-local environments).
- `CORS_ORIGINS` / `CORS_ORIGIN_REGEX`: Allowed frontend origins.

> **Note:** On initial face verification, OpenCV YuNet/SFace model weights are downloaded automatically if not already present.

### 3. Frontend setup

```sh
cd frontend
npm ci
```

If the backend API is hosted on a non-default URL, create `frontend/.env.local` and set:

```sh
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Running the application

Run the backend and frontend in separate terminals after starting the Docker services.

### Backend (FastAPI)

```sh
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Backend startup automatically initializes the database schema.

### Frontend (Next.js)

```sh
cd frontend
npm run dev
```

For a production build:

```sh
cd frontend
npm run build
npm run start
```

### Local endpoints

| Service / Endpoint | URL |
| --- | --- |
| Web Portal | http://localhost:3000 |
| FastAPI Swagger / OpenAPI Docs | http://localhost:8000/docs |
| Backend Health Check | http://localhost:8000/health |

For multi-device testing over HTTPS, WebSocket routing, and LiveKit reachability, see [Cross-device verification](docs/CROSS_DEVICE_TESTING.md).

## Running and checking test cases

> [!IMPORTANT]
> Read [AGENTS.md](AGENTS.md) before running tests against a shared database. Never leave synthetic users, demo exams, or mock proctoring history in the database, and never modify or delete authentic faculty exams.

### Frontend tests

Frontend unit and state-machine tests use Node's built-in test runner (`node --test tests/*.test.mjs`):

```sh
cd frontend
npm test
```

To run a single frontend test file or lint check:

```sh
cd frontend
node --test tests/continuous_proctoring.test.mjs
npm run lint
```

### Backend tests

Backend tests use `pytest` (with `pytest-asyncio`) and require PostgreSQL and Redis to be running (`docker compose up -d`). Configure `DATABASE_URL` in `backend/.env` (or export it) to point to a disposable/test PostgreSQL database.

Run the full backend test suite:

```sh
cd backend
.venv/bin/pytest tests/ -v
```

Run a specific test file or individual test case:

```sh
cd backend
.venv/bin/pytest tests/test_continuous_proctoring.py -v
.venv/bin/pytest tests/test_continuous_proctoring.py::test_continuous_proctoring_full_suite -v
```

Common useful `pytest` flags:
- `-v`: verbose test output
- `-x` / `--maxfail=1`: stop on first failure
- `-k "<pattern>"`: run tests matching a name expression
- `-s`: show stdout/stderr output during test execution

The `backend/tests/conftest.py` autouse fixture (`clean_test_entities`) automatically cleans up synthetic test users and exams created during pytest runs.
