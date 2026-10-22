# ExamGuard AI — Online Examination & Intelligent Proctoring Platform

ExamGuard AI is a full-stack, enterprise-grade web platform designed for secure online examination management, question authoring, student profile administration, and interactive test attempts with automated MCQ scoring, multi-modal AI proctoring, live WebRTC video/audio streaming, and candidate identity verification.

---

## 🏛 System Architecture

```
                                      AUTH & RBAC
                                           │
            ┌──────────────────────────────┼──────────────────────────────┐
            ▼                              ▼                              ▼
         STUDENT                        FACULTY                         ADMIN
            │                              │                              │
   ┌────────┴────────┐            ┌────────┴────────┐            ┌────────┴────────┐
   ▼                 ▼            ▼                 ▼            ▼                 ▼
Available         Identity &   Exam Creator       Live Proctor   System Wide    Student
Exams             Test Area    & Questions        & Gradebook    Management     Directory
```

```
                       REAL-TIME PROCTORING PIPELINE
                       
   [Student Device]                                            [Faculty Device]
   ├── Webcam & Mic Stream ──▶ [WebRTC PeerConnection] ──────▶ ├── Live Candidate Video
   ├── Fullscreen Lockdown                                     ├── Real-Time Audio Level
   ├── Continuous Face Verif ──▶ [FastAPI Backend] ──────────▶ ├── Instant Incident Alert
   └── State / Violation WS ──▶ [WebSocket Hub] ─────────────▶ └── Evidence Gallery
```

Detailed technical specifications and data-flow diagrams are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🛠 Technology Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Glassmorphic UI System, Lucide Icons, Next.js Edge Middleware.
- **Backend**: FastAPI, Python 3.10+, Pydantic v2, Async SQLAlchemy 2.0, PyJWT, Passlib (Bcrypt), Asyncpg, WatchFiles, WebSockets.
- **Real-Time Streaming**: WebSockets for signaling & candidate room sync, WebRTC for low-latency peer-to-peer video & audio feeds with STUN/TURN fallback.
- **Database**: PostgreSQL 16 (Relational models for Users, Profiles, Exams, Questions, Attempts, Answers, Violations, Re-Exam Consumptions, and Proctoring Events).
- **Session / Cache**: Redis 7 (JWT Refresh Token storage, session tracking, token rotation, and invalidation) with in-memory failover support.

---

## 🚀 Key Features Implemented So Far

### 1. Authentication & Role-Based Access Control
- **JWT Architecture**: Short-lived JWT access tokens (15 mins) and Redis-backed refresh token rotation (7 days) with in-memory fallback.
- **Role-Based Authorization**: Three distinct user roles (`STUDENT`, `FACULTY`, `ADMIN`) enforced via FastAPI route dependencies and Next.js Edge Middleware (`middleware.ts`).
- **Profile Completion Flow**: Gated exam access ensuring students complete profile details and photo registration prior to starting tests.

### 2. Exam Management & Question Authoring
- **Faculty Exam Creation Wizard**: 4-step wizard to configure exam title, description, duration, passing marks, schedule windows (`ALWAYS` vs `SCHEDULED`), attempt policy (`ONE_ATTEMPT` vs `MULTIPLE_ATTEMPTS`), and negative marking policies (`NONE` vs `PER_QUESTION`).
- **Question Authoring & Builder**:
  - **Multiple Choice Questions (MCQ)**: 2–6 choices with visual correct answer selector, customizable marks, negative deductions, and explanations.
  - **Short Answer Questions**: Question prompt, expected reference answer, and custom point allocation with manual faculty review queue.
  - **CSV / Excel Bulk Import**: Drag-and-drop parser with live data preview and row-by-row syntax/schema validation.
- **Publishing Safeguards**: Validates title, duration, marks, and question answer configurations before an exam can be published.

### 3. Student Examination Test Interface
- **Pre-Exam Rules & Device Check**: Instructions, browser hardware checks, webcam & microphone preview.
- **Interactive Workspace**: Real-time synchronized countdown timer with auto-submit upon expiration.
- **Question Navigator**: Sidebar palette indicating question states (`Unanswered`, `Answered`, `Marked for Review`, `Current`).
- **Auto-Saving**: Continuous background answer persistence on selection change or question switch.
- **Submission Modal**: Summary breakdown before final commit with instant MCQ score calculation.

### 4. Real-Time Multi-Modal AI Proctoring
- **WebSocket Signaling Engine**: Real-time room management (`/api/v1/exams/{exam_id}/ws`) linking student test sessions to faculty monitoring consoles.
- **WebRTC Peer Streaming**: Live video and audio feed streaming directly from the student's browser to the faculty live grid.
- **Multi-Modal Violation Detection**:
  - Face absence / looking away detection
  - Multiple faces in candidate frame
  - Unauthorized objects / mobile phone detection
  - Tab switching, window blur, and fullscreen lockdown exit
  - Audio noise & speech anomalies
- **Lockdown Overlays**:
  - `ExamLockdownOverlay`: Freezes the test and blocks interactions when fullscreen is exited or the tab loses focus.
  - `ExamMediaLockOverlay`: Pauses test execution when the webcam or microphone stream is disconnected or muted.
- **Evidence Capture**: Automatic frame snapshots stored securely in `uploads/` and `proctoring-evidence/` with disk references logged in database.

### 5. Candidate Identity Verification
- **Pre-Exam Photo Verification**: Student captures live webcam snapshot before exam entry, automatically verified against registered profile picture.
- **Continuous Background Verification**: Sampled background frames analyzed periodically during active exams to prevent candidate substitution.

### 6. Faculty Live Proctoring & Evidence Review Center
- **Live Candidate Monitor**: Real-time grid of all active candidates displaying live video feeds, audio activity meters, rejoin counts, and live violation badge counts.
- **Interactive Evidence Gallery**: Comprehensive gallery to filter incidents by exam, student, severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), and review status.
- **Faculty Review Action**: Classify incidents as `CONFIRMED`, `DISMISSED`, or `FALSE_POSITIVE` with audit comments.
- **Gradebook & Manual Grading**: Faculty grading interface to review student submissions and score short-answer questions.

### 7. Re-Examination Permission Engine & Attempt Concurrency
- **Targeted & Global Re-Exam Grants**: Faculty can award additional attempts to individual students or to an entire class.
- **Per-Student Consumption Tracking**: `ExamReexamConsumption` table tracks consumption of global permissions so one student cannot consume another's attempts.
- **Atomic Concurrency Controls**: PostgreSQL partial unique index on `(student_id, exam_id) WHERE status = 'IN_PROGRESS'` prevents concurrent attempts or multiple tabs.
- **Idempotent Resumption**: Clean reconnect flow for students recovering from network drops or page reloads without losing time.

### 8. Faculty Analytics Dashboard & Student Directory
- **Live Metric Counters**: Real-time summary of total exams, published exams, student counts, submissions, and critical proctoring alerts.
- **Recent Incident Feed**: Stream of the latest proctoring events with one-click navigation to evidence reviews.
- **Batch & Student Management**: Student directory with batch filtering, search, manual account creation, CSV bulk import, and account status toggling.
- **Profile Edit Requests**: Student profile change request workflow with faculty approval controls.

### 9. Cross-Device Live Testing Support
- Full support for multi-device testing (student on mobile phone/laptop and faculty on desktop/laptop) via HTTPS/WSS tunnels (`ngrok`). Detailed walkthrough available in [`docs/CROSS_DEVICE_TESTING.md`](docs/CROSS_DEVICE_TESTING.md).

---

## 📋 API Endpoints Summary

### Authentication & Users
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register new user account | Public |
| `POST` | `/api/v1/auth/login` | Authenticate & issue access/refresh tokens | Public |
| `POST` | `/api/v1/auth/refresh` | Refresh access token via refresh token rotation | Public |
| `POST` | `/api/v1/auth/logout` | Revoke session refresh token | Authenticated |
| `GET` | `/api/v1/auth/me` | Retrieve authenticated user profile | Authenticated |

### Exam Management & Questions
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/exams` | List exams (filtered for Students or Faculty) | Authenticated |
| `POST` | `/api/v1/exams` | Create draft exam paper | Faculty, Admin |
| `GET` | `/api/v1/exams/{id}` | Get detailed exam configuration | Authenticated |
| `PUT` | `/api/v1/exams/{id}` | Update exam settings and timings | Faculty, Admin |
| `DELETE` | `/api/v1/exams/{id}` | Delete exam paper | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/publish` | Validate & publish exam | Faculty, Admin |
| `GET` | `/api/v1/exams/{id}/questions` | List questions for an exam | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/questions` | Add question (MCQ / Short Answer) | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/questions/import/preview` | Preview CSV/Excel question import | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/questions/import` | Commit imported questions | Faculty, Admin |
| `POST` | `/api/v1/exams/{id}/reexam-permissions` | Grant re-exam permission (individual or all) | Faculty, Admin |
| `GET` | `/api/v1/exams/{id}/reexam-permissions` | View granted re-exam permissions | Faculty, Admin |

### Exam Attempts & Examination Engine
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/student/active-exam` | Get student's currently active in-progress attempt | Student |
| `GET` | `/api/v1/exams/{id}/student-status` | Get attempt count, eligibility & remaining attempts | Student |
| `POST` | `/api/v1/exams/{id}/attempts` | Start or resume exam attempt (atomic) | Student |
| `POST` | `/api/v1/attempts/{id}/rejoin` | Rejoin active attempt following disconnect | Student |
| `GET` | `/api/v1/attempts/{id}` | Get attempt details and question list | Authenticated |
| `POST` | `/api/v1/attempts/{id}/answers` | Save or update question answer (auto-save) | Student |
| `POST` | `/api/v1/attempts/{id}/submit` | Submit attempt & trigger automatic scoring | Student |
| `POST` | `/api/v1/attempts/{id}/violations` | Log exam violation event | Student |
| `GET` | `/api/v1/attempts/{id}/violations` | Retrieve violations for attempt | Authenticated |
| `GET` | `/api/v1/exams/{id}/gradebook` | Get complete gradebook for exam | Faculty, Admin |
| `GET` | `/api/v1/attempts/{id}/review` | Detailed attempt review and submission answers | Authenticated |
| `PATCH` | `/api/v1/attempts/{id}/answers/{aid}/grade` | Manually grade short-answer question | Faculty, Admin |
| `WS` | `/api/v1/exams/{id}/ws` | WebRTC signaling & real-time candidate room sync | Authenticated |

### Identity Verification & Proctoring
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/identity/verify` | Verify student face snapshot against profile photo | Student |
| `GET` | `/api/v1/identity/status/{exam_id}` | Check student verification status for exam | Student |
| `POST` | `/api/v1/proctoring/continuous-verify` | Analyze background webcam frame for violations | Student |
| `GET` | `/api/v1/proctoring/events/{exam_id}` | List recorded proctoring incidents for exam | Authenticated |
| `GET` | `/api/v1/proctoring/evidence/{event_id}` | Securely retrieve violation evidence screenshot | Authenticated |
| `PATCH` | `/api/v1/proctoring/events/{event_id}/review` | Review & classify incident (`CONFIRMED`, etc.) | Faculty, Admin |

### Student & Faculty Administration
| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/faculty/dashboard-stats` | Faculty dashboard counters, incidents, and rosters | Faculty, Admin |
| `GET` | `/api/v1/students` | Search and filter student directory | Faculty, Admin |
| `POST` | `/api/v1/students` | Create student account manually | Faculty, Admin |
| `GET` | `/api/v1/students/{id}` | Get student profile details | Faculty, Admin |
| `PUT` | `/api/v1/students/{id}` | Edit student profile | Faculty, Admin |
| `PATCH` | `/api/v1/students/{id}/status` | Activate or deactivate student account | Faculty, Admin |
| `POST` | `/api/v1/students/import/preview` | Preview CSV/Excel student roster import | Faculty, Admin |
| `POST` | `/api/v1/students/import` | Commit imported students | Faculty, Admin |
| `POST` | `/api/v1/students/me/photo` | Upload registered student profile photo | Student |
| `GET` | `/api/v1/faculty/batches` | List batch summaries and student counts | Faculty, Admin |

---

## 💻 Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- PostgreSQL 16 (or Docker)
- Redis 7 (or Docker; in-memory fallback is active if Redis is offline)

### 1. Database & Cache Services
Run PostgreSQL and Redis via Docker:
```bash
docker-compose up -d
```
*(Alternatively, point `backend/.env` to an existing local PostgreSQL instance).*

### 2. Backend Server
```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
python init_db_script.py
uvicorn app.main:app --reload --port 8000
```
- API Base URL: `http://localhost:8000`
- Swagger UI Documentation: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`

### 3. Frontend Application
```bash
cd frontend
npm install
npm run dev
```
- Application Web App: `http://localhost:3000`

---

## 🧪 Testing & Database Purity Rules

Run the automated backend test suite using `pytest`:

```bash
cd backend
source .venv/bin/activate
pytest tests/
```

### Strict Operating Guidelines (`AGENTS.md`)
- **Zero Demo / Test Clutter**: Never leave synthetic test exams, mock questions, or dummy student/faculty members in the development or live database.
- **Immediate Teardown**: All automated integration tests must clean up created users and exams in `try...finally` blocks.
- **Dashboard Integrity**: The student and faculty portals only display exams manually scheduled by authentic faculty accounts.
