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

## Run locally

Use Python 3.10+, Node.js 18+ with npm, and Docker Compose. From the repository root:

```sh
docker compose up -d
```

This starts PostgreSQL, Redis, and a development LiveKit server. In one terminal:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp -n .env.example .env
uvicorn app.main:app --reload --port 8000
```

Backend startup initializes the database. Review the development connection settings in `backend/.env` before startup. Initial face verification can download the model weights if they are missing. In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

| Endpoint | Address |
| --- | --- |
| Portal | http://localhost:3000 |
| API schema and interactive docs | http://localhost:8000/docs |
| API health response | http://localhost:8000/health |

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if the API is on a different host. Use the cross-device guide for HTTPS, WebSocket routing, and LiveKit reachability.

## Verify changes

Run frontend tests with `npm test` from `frontend`. For backend integration tests, configure `DATABASE_URL` to point to a disposable PostgreSQL database before running `python -m pytest tests/` from `backend`. See the [testing rules](AGENTS.md) before creating any test records. Use synthetic exams only in isolated testing, remove all test data and evidence immediately, and protect authentic faculty exams and gradebooks.
