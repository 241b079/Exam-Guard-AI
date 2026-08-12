# Online Exam Proctoring System — Phase 1

Phase 1 establishes the core foundation for authentication, database storage, Redis session management, role-based authorization, Next.js middleware protection, and role-specific dummy dashboards for the **Online Examination & Proctoring Platform**.

---

## Architecture Overview

```
                      AUTH
                       │
                       ▼
                     USER
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     STUDENT        FACULTY         ADMIN
        │              │              │
        ▼              ▼              ▼
    DASHBOARD      DASHBOARD      DASHBOARD
```

### Technology Stack

- **Frontend**: Next.js (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons, Edge Middleware.
- **Backend**: FastAPI, Python 3.10+, Pydantic v2, Async SQLAlchemy 2.0, PyJWT, Passlib (Bcrypt).
- **Database**: PostgreSQL 16.
- **Session/Cache**: Redis 7 (JWT Refresh Token storage, rotation, and revocation tracking).

---

## Project Structure

```
online-exam-proctoring/
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── student/dashboard/page.tsx
│   │   ├── faculty/dashboard/page.tsx
│   │   └── admin/dashboard/page.tsx
│   ├── features/
│   │   ├── auth/ (components, services, hooks, types)
│   │   └── users/ (services, types)
│   ├── components/
│   │   ├── ui/ (Button, Input, Card, Badge, Select)
│   │   ├── layout/ (DashboardLayout, Sidebar, Header)
│   │   └── shared/ (UserMenu, Loading, EmptyState)
│   ├── lib/ (api.ts fetch client with JWT refresh handling)
│   ├── middleware.ts (Next.js route protection & role redirect)
│   ├── package.json
│   └── .env.example
│
├── backend/
│   ├── app/
│   │   ├── features/
│   │   │   ├── auth/ (router.py, service.py, schemas.py, dependencies.py)
│   │   │   └── users/ (router.py, service.py, schemas.py, models.py)
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   ├── database.py
│   │   │   ├── redis.py
│   │   │   └── logging.py
│   │   └── main.py
│   ├── tests/ (test_auth.py)
│   ├── requirements.txt
│   └── .env.example
│
├── README.md
├── .gitignore
└── docker-compose.yml
```

---

## Getting Started

### 1. Prerequisites

- Docker & Docker Compose
- Python 3.10+
- Node.js 18+ & npm

### 2. Start PostgreSQL & Redis

Run the background Docker services:

```bash
docker-compose up -d
```

This starts:

- **PostgreSQL** on port `5432` (`postgresql://user:password@localhost:5432/online_exam`)
- **Redis** on port `6379` (`redis://localhost:6379`)

---

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Run FastAPI dev server
uvicorn app.main:app --reload --port 8000
```

FastAPI Documentation available at:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

---

### 4. Frontend Setup

In a separate terminal:

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local file
cp .env.example .env.local

# Run Next.js dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## API Endpoints Summary

| Method | Endpoint                | Description                                       | Protected |
| :----- | :---------------------- | :------------------------------------------------ | :-------- |
| `GET`  | `/health`               | Server health check                               | No        |
| `POST` | `/api/v1/auth/register` | Register new user (STUDENT, FACULTY, ADMIN)       | No        |
| `POST` | `/api/v1/auth/login`    | Authenticate user & return Access + Refresh token | No        |
| `POST` | `/api/v1/auth/refresh`  | Refresh JWT access token with token rotation      | No        |
| `POST` | `/api/v1/auth/logout`   | Invalidate refresh token in Redis                 | Yes       |
| `GET`  | `/api/v1/auth/me`       | Current authenticated user profile                | Yes       |
| `GET`  | `/api/v1/users/me`      | Current user details                              | Yes       |

---

## Testing

Run backend tests using `pytest`:

```bash
cd backend
source .venv/bin/activate
pytest
```

hi
