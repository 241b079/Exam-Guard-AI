import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_phase2_complete_exam_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register Faculty User
        faculty_email = f"faculty_{uuid.uuid4().hex[:8]}@university.edu"
        faculty_reg = await ac.post("/api/v1/auth/register", json={
            "name": "Prof. Smith",
            "email": faculty_email,
            "password": "Password123!",
            "role": "FACULTY"
        })
        assert faculty_reg.status_code == 201
        
        faculty_login = await ac.post("/api/v1/auth/login", json={
            "email": faculty_email,
            "password": "Password123!"
        })
        assert faculty_login.status_code == 200
        faculty_token = faculty_login.json()["access_token"]
        faculty_headers = {"Authorization": f"Bearer {faculty_token}"}

        # 2. Faculty Creates Exam
        exam_create_res = await ac.post("/api/v1/exams", json={
            "title": "Data Structures Midterm",
            "description": "Comprehensive evaluation of Stacks, Queues, and Trees",
            "duration_minutes": 60,
            "negative_marking": "PER_QUESTION",
            "auto_submit": True,
            "display_countdown": True,
            "assignment_type": "ALL_STUDENTS",
            "availability_type": "ALWAYS"
        }, headers=faculty_headers)
        assert exam_create_res.status_code == 201
        exam_data = exam_create_res.json()
        exam_id = exam_data["id"]
        assert exam_data["status"] == "DRAFT"

        # 3. Faculty Adds MCQ Question
        mcq_res = await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "Which data structure follows First-In, First-Out (FIFO)?",
            "options": ["Stack", "Queue", "Tree", "Graph"],
            "correct_answer": "Queue",
            "marks": 5.0,
            "negative_marks": 1.0,
            "explanation": "Queue is FIFO, Stack is LIFO."
        }, headers=faculty_headers)
        assert mcq_res.status_code == 201
        mcq_q_id = mcq_res.json()["id"]

        # 4. Faculty Adds Short Answer Question
        sa_res = await ac.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "SHORT_ANSWER",
            "question_text": "Define time complexity of Binary Search.",
            "correct_answer": "O(log N)",
            "marks": 10.0,
            "negative_marks": 0.0
        }, headers=faculty_headers)
        assert sa_res.status_code == 201
        sa_q_id = sa_res.json()["id"]

        # 5. Faculty Publishes Exam
        pub_res = await ac.post(f"/api/v1/exams/{exam_id}/publish", headers=faculty_headers)
        assert pub_res.status_code == 200
        assert pub_res.json()["status"] == "PUBLISHED"
        assert pub_res.json()["question_count"] == 2
        assert pub_res.json()["total_marks"] == 15.0

        # 6. Register Student User
        student_email = f"student_{uuid.uuid4().hex[:8]}@university.edu"
        student_reg = await ac.post("/api/v1/auth/register", json={
            "name": "Jane Student",
            "email": student_email,
            "password": "Password123!",
            "role": "STUDENT"
        })
        assert student_reg.status_code == 201

        student_login = await ac.post("/api/v1/auth/login", json={
            "email": student_email,
            "password": "Password123!"
        })
        assert student_login.status_code == 200
        student_token = student_login.json()["access_token"]
        student_headers = {"Authorization": f"Bearer {student_token}"}

        # 7. Student Sees Available Exams
        avail_res = await ac.get("/api/v1/exams", headers=student_headers)
        assert avail_res.status_code == 200
        student_exams = avail_res.json()
        assert any(e["id"] == exam_id for e in student_exams)

        # 8. Student Starts Attempt
        att_res = await ac.post(f"/api/v1/exams/{exam_id}/attempts", headers=student_headers)
        assert att_res.status_code == 201
        attempt_data = att_res.json()
        attempt_id = attempt_data["id"]
        assert attempt_data["status"] == "IN_PROGRESS"

        # 9. Student Answers MCQ Question Correctly
        mcq_ans_res = await ac.post(f"/api/v1/attempts/{attempt_id}/answers", json={
            "question_id": mcq_q_id,
            "selected_option": "Queue",
            "is_marked_for_review": False
        }, headers=student_headers)
        assert mcq_ans_res.status_code == 200

        # 10. Student Answers Short Answer Question
        sa_ans_res = await ac.post(f"/api/v1/attempts/{attempt_id}/answers", json={
            "question_id": sa_q_id,
            "answer_text": "Binary search has logarithmic time complexity O(log n).",
            "is_marked_for_review": True
        }, headers=student_headers)
        assert sa_ans_res.status_code == 200

        # 11. Student Submits Exam & Checks Results
        submit_res = await ac.post(f"/api/v1/attempts/{attempt_id}/submit", headers=student_headers)
        assert submit_res.status_code == 200
        sub_data = submit_res.json()
        assert sub_data["status"] == "SUBMITTED"
        assert sub_data["total_questions"] == 2
        assert sub_data["attempted_questions"] == 2
        assert sub_data["correct_mcq_count"] == 1
        assert sub_data["total_score"] == 5.0  # 5 marks awarded for MCQ
        assert sub_data["short_answer_status"] == "Pending Review"
