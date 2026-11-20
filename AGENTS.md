# AI Agent Operating Guidelines & Testing Rules

This document outlines mandatory guidelines and constraints for all AI agents, automated assistants, and developers working in the **Exam-Guard-AI** repository.

---

## 1. Zero Demo / Test Clutter in Application Database

### Strict Rule:
**DO NOT leave demo exams, mock questions, or dummy student/faculty members in the application database.**

1. **Only Genuine Faculty Exams Allowed**:
   - The student and faculty sections must **only** display exams manually created by authentic faculty/teachers (e.g., `faculty@gmail.com`, `faculty1@gmail.com`).
   - Never inject sample/demo exams (such as "Demo Exam", "Test Midterm", "Phase 2 Automated Exam", etc.) as permanent fixtures into the development or live database.

2. **Only Genuine User Accounts**:
   - Authentic members include real faculty, students, and admins.
   - Do not leave synthetic users (e.g., `prof_*@univ.edu`, `stu_*@student.edu`, `testuser_*`) persisted in the `users` table after testing.

---

## 2. Immediate Teardown & Cleanup After Testing

Whenever an AI agent or test runner creates database entities (users, exams, attempts, violations, proctoring events) for the purpose of integration testing, verification, or debugging:

1. **Immediate Deletion**:
   - All test entities **MUST be deleted immediately** after the test/verification finishes.
   - Use `try...finally` blocks in test scripts to ensure cleanup executes even if errors or assertions fail.
   - Example pattern:
     ```python
     created_exam_ids = []
     created_user_ids = []
     try:
         # Perform test operations...
     finally:
         # Immediate cleanup
         async with engine.begin() as conn:
             if created_exam_ids:
                 await conn.execute(text("DELETE FROM exams WHERE id = ANY(:ids)"), {"ids": created_exam_ids})
             if created_user_ids:
                 await conn.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": created_user_ids})
     ```

2. **Isolated or In-Memory Databases for Automated Suites**:
   - Whenever possible, run unit/integration tests with transaction rollbacks or an isolated temporary database schema so production/development state remains pristine.

3. **Post-Test Verification**:
   - After completing any task involving exam creation or user management, check the database to verify that only genuine faculty exams and users remain.

---

## 3. Student Dashboard Purity

- The student exam list (`/student` or `/dashboard`) must always reflect only authentic faculty-scheduled exams.
- If any test exam appears in the student section, identify its `id` and remove it immediately along with any cascaded test records (`exam_attempts`, `exam_violations`, `proctoring_events`).

---

## 4. Absolute Protection of Faculty-Created Exams & No Blanket Deletion

### Strict Rule:
**NEVER delete, modify, or truncate exams or questions created by authentic faculty.**

1. **No Blanket Deletion Queries**:
   - Queries like `DELETE FROM exams WHERE title NOT IN (...)` are **strictly forbidden**. They delete genuine exams whenever faculty creates a new exam with a new title.
   - Deletions in test cleanup must **strictly target only synthetic IDs** created during that specific test run (`WHERE id = ANY(:created_exam_ids)`), or where `created_by_id` belongs to a synthetic test user (`email LIKE 'temp_%'`).

2. **Authentic Faculty Exams are Immutable to AI Agents**:
   - Any exam where `created_by_id` belongs to an authentic faculty account (`faculty@gmail.com`, `faculty1@gmail.com`, etc.) must never be deleted by automated test runners, fixtures, or scripts.

---

## 5. Prohibition on AI-Generated History on Faculty Exams

### Strict Rule:
**AI agents MUST NOT create synthetic attempts, fake test submissions, or mock proctoring history on any exam created by authentic faculty.**

1. **No Test History on Faculty Exams**:
   - Do not inject mock exam attempts, test answers, or simulated violations into authentic faculty exams (e.g. `Math 1`, `Data Structure and algorithms`, `gk`, etc.).
   - All testing requiring exam attempts, submission workflows, or proctoring violations **MUST create their own temporary synthetic exam** and tear it down immediately in `try...finally`.

2. **Purity of Faculty Gradebooks & History**:
   - The gradebook, submissions, and proctoring history of authentic faculty exams must belong 100% to genuine student activity. AI test runners must never pollute them with dummy submissions or mock incidents.
