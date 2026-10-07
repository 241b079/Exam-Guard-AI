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
