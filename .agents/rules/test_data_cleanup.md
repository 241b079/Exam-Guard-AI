---
description: Rules for database state purity - preventing demo exams/members and mandating immediate cleanup after testing
globs: ["**/*"]
---

# Database Purity & Test Data Cleanup Rules

## Directives for AI Agents:
1. **Never create or retain demo exams or test members** in the active development/shared database.
2. The student section and faculty dashboards must **only display genuine exams created manually by faculty**.
3. If temporary exams, users, or attempts are created for validation or testing:
   - Always wrap tests in a teardown or `try...finally` block.
   - **Immediately delete all created test entities upon completion**.
4. Before concluding any task or test session, verify that only genuine faculty exams and users are present in the database.
