# Online Exam Proctoring System

An end-to-end web platform for secure online examination management, question authoring, student profile administration, and interactive test attempts with automated MCQ grading.

---

## System Architecture

```
                               AUTH & RBAC
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
        STUDENT                  FACULTY                   ADMIN
           │                        │                        │
  ┌────────┴────────┐      ┌────────┴────────┐      ┌────────┴────────┐
  ▼                 ▼      ▼                 ▼      ▼                 ▼
Catalog          Attempt  Exam             Student  Student         System
Exams           Interface Creator          Directory Management    Overview
```

### Technology Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Glassmorphic Design System, Lucide Icons, Next.js Edge Middleware.
- **Backend**: FastAPI, Python 3.10+, Pydantic v2, Async SQLAlchemy 2.0, PyJWT, Passlib (Bcrypt), Asyncpg.
- **Database**: PostgreSQL 16 (Relational models for Users, Student Profiles, Exams, Questions, Attempts, and Answers).
- **Session / Cache**: Redis 7 (JWT Refresh Token storage, session tracking, token rotation, and invalidation).

---

## Core Features Implemented

### Phase 1: Authentication & Role-Based Access Control
- **JWT Authentication**: Short-lived JWT access tokens and Redis-backed refresh token rotation.
- **Role-Based Authorization**: Three distinct user roles (`STUDENT`, `FACULTY`, `ADMIN`).
- **Route Protection**: Edge middleware (`middleware.ts`) enforcing role-based page redirects.

### Phase 2: Exam Management & Examination Workflow
- **Faculty Exam Creation Wizard**: 4-step wizard to configure exam title, duration, negative marking policy (`NONE`, `PER_QUESTION`), auto-submit on timer expiration, countdown display, assignment targets (`ALL_STUDENTS`, `SELECTED_STUDENTS`), and schedule availability windows.
- **Question Authoring & Builder**:
  - **Multiple Choice Questions (MCQ)**: 2–6 choices with radio selector for correct answer, customizable points, negative marks, and explanations.
  - **Short Answer Questions**: Question text prompt, expected reference answer, and custom point allocation.
  - **CSV / Excel Bulk Import**: Drag-and-drop parser validating required fields before previewing and committing.
- **Publishing Rules**: Enforces mandatory checks (title, duration, at least one question with valid answer configuration) before publishing.
- **Student Examination Test Interface**:
  - Pre-exam rules & instructions page.
  - Interactive exam workspace with real-time countdown timer.
  - Sidebar Question Navigator displaying live statuses (`Unanswered`, `Answered`, `Marked for Review`, `Current`).
  - Answer auto-saving during option selection or navigation.
  - Submission confirmation modal showing summary breakdown.
- **Automated Grading Engine**: Instant auto-scoring for MCQ questions with negative marking support and `Pending Review` status for short answers.

### Phase 2 Addition: Student Management System
- **Student Management Directory** (`/faculty/students` & `/admin/students`):
  - Accessible by both Faculty and Admin users.
  - Interactive student directory with real-time search (name, email, roll number, department) and department/status filters.
- **Manual Student Creation**: Form validating name, email, student ID / roll number, and student profile metadata (department, course, semester, section, phone, address).
- **CSV / XLSX Bulk Student Import**:
  - File parser validating required columns (`name`, `email`, `student_id`), email syntax, and semester ranges.
  - Row-by-row validation error preview showing line numbers without aborting valid imports.
- **Account Management & Status Toggling**: Activate or deactivate student accounts (`Active` / `Inactive`).
- **Self-Registration Auto-Provisioning**: Automatic linking of `StudentProfile` when a student self-registers via `/register`.

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
│   │   ├── student/
│   │   │   ├── dashboard/page.tsx
│   │   │   └── exams/ (catalog, instructions, exam interface, result summary)
│   │   ├── faculty/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── exams/ (catalog, create wizard, detail, edit, questions, import)
│   │   │   └── students/page.tsx
│   │   └── admin/
│   │       ├── dashboard/page.tsx
│   │       └── students/page.tsx
│   ├── features/
│   │   ├── auth/ (components, hooks, services, types)
│   │   ├── users/ (services, types)
│   │   ├── exams/ (components, hooks, services, types)
│   │   ├── questions/ (components, hooks, services, types)
│   │   ├── attempts/ (components, hooks, services, types)
│   │   └── students/ (components, hooks, services, types)
│   ├── components/
│   │   ├── ui/ (Button, Input, Card, Badge, Select)
│   │   ├── layout/ (DashboardLayout, Sidebar, Header)
│   │   └── shared/ (UserMenu, Loading, EmptyState)
│   ├── lib/ (api.ts fetch client)
│   └── middleware.ts
│
├── backend/
│   ├── app/
│   │   ├── features/
│   │   │   ├── auth/ (router.py, service.py, schemas.py, dependencies.py)
│   │   │   ├── users/ (router.py, service.py, schemas.py, models.py)
│   │   │   ├── exams/ (router.py, service.py, schemas.py, models.py)
│   │   │   ├── questions/ (router.py, service.py, schemas.py, models.py)
│   │   │   ├── attempts/ (router.py, service.py, schemas.py, models.py)
│   │   │   └── students/ (router.py, service.py, schemas.py, models.py)
│   │   ├── core/ (config, database, redis, security, logging)
│   │   └── main.py
│   ├── tests/ (test_auth.py, test_users.py, test_phase2_exams.py, test_students.py)
│   ├── requirements.txt
│   └── init_db_script.py
│
├── README.md
├── .gitignore
└── docker-compose.yml
```

---

## API Endpoints Summary

| Method | Endpoint | Description | Roles |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Server health check | Public |
| `POST` | `/api/v1/auth/register` | User registration | Public |
| `POST` | `/api/v1/auth/login` | Authenticate & issue tokens | Public |
| `POST` | `/api/v1/auth/refresh` | Refresh access token | Public |
| `POST` | `/api/v1/auth/logout` | Revoke session refresh token | Authenticated |
| `GET` | `/api/v1/auth/me` | Current authenticated user | Authenticated |
| `GET` | `/api/v1/exams` | List exams (filtered for Students / Faculty) | Authenticated |
| `POST` | `/api/v1/exams` | Create exam draft | Faculty, Admin |
| `GET` | `/api/v1/exams/{id}` | Get exam details | Authenticated |
| `PUT` | `/api/v1/exams/{id}` | Update exam configuration | Faculty, Admin |
| `DELETE` | `/api/v1/exams/{id}` | Delete exam paper | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/publish` | Publish exam | Faculty, Admin |
| `GET` | `/api/v1/exams/{id}/questions` | List exam questions | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/questions` | Add question (MCQ / Short Answer) | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/questions/import/preview` | Preview CSV/XLSX question import | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/questions/import` | Commit imported questions | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/attempts` | Start or resume exam attempt | Student |
| `GET` | `/api/v1/attempts/{id}` | Get attempt details | Student |
| `POST` | `/api/v1/attempts/{id}/answers` | Save question answer | Student |
| `POST` | `/api/v1/attempts/{id}/submit` | Finalize & score exam attempt | Student |
| `GET` | `/api/v1/students` | Search & filter student directory | Faculty, Admin |
| `POST` | `/api/v1/students` | Add student manually | Faculty, Admin |
| `GET` | `/api/v1/students/{id}` | Get student profile details | Faculty, Admin |
| `PUT` | `/api/v1/students/{id}` | Edit student profile | Faculty, Admin |
| `PATCH` | `/api/v1/students/{id}/status` | Activate or deactivate student account | Faculty, Admin |
| `POST` | `/api/v1/students/import/preview` | Preview CSV/XLSX student import | Faculty, Admin |
| `POST` | `/api/v1/students/import` | Commit imported student accounts | Faculty, Admin |

---

## Running locally

### 1. Database & Cache Services
```bash
docker-compose up -d
```

### 2. Backend Server
```bash
cd backend
source .venv/bin/activate
python init_db_script.py
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Application
```bash
cd frontend
npm run dev
```

---

## Testing

Run the automated backend test suite using `pytest`:

```bash
cd backend
source .venv/bin/activate
TESTING=1 pytest
```
