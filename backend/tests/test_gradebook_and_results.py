import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security import create_access_token
from app.features.users.models import User, UserRole
from app.features.exams.models import Exam, ExamStatus, AttemptPolicyType
from app.features.questions.models import Question, QuestionType
from app.core.database import AsyncSessionLocal


@pytest.mark.asyncio
async def test_gradebook_results_and_manual_grading_flow():
    # 1. Setup DB state: 1 Faculty, 1 Unauthorized Faculty, 2 Students
    async with AsyncSessionLocal() as db:
        faculty_id = str(uuid.uuid4())
        other_faculty_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())
        other_student_id = str(uuid.uuid4())

        fac = User(
            id=faculty_id,
            email=f"prof_{faculty_id[:6]}@example.com",
            password_hash="testpass",
            role=UserRole.FACULTY,
            name="Professor X"
        )
        other_fac = User(
            id=other_faculty_id,
            email=f"other_prof_{other_faculty_id[:6]}@example.com",
            password_hash="testpass",
            role=UserRole.FACULTY,
            name="Professor Y"
        )
        stu = User(
            id=student_id,
            email=f"stu_{student_id[:6]}@example.com",
            password_hash="testpass",
            role=UserRole.STUDENT,
            name="Alice Student"
        )
        other_stu = User(
            id=other_student_id,
            email=f"stu2_{other_student_id[:6]}@example.com",
            password_hash="testpass",
            role=UserRole.STUDENT,
            name="Bob Student"
        )
        db.add_all([fac, other_fac, stu, other_stu])

        # Create Exam owned by faculty with 1 MCQ (5 marks) and 1 Short Answer (5 marks)
        exam_id = str(uuid.uuid4())
        exam = Exam(
            id=exam_id,
            title="AI & Ethics Comprehensive Exam",
            description="End of semester test",
            duration_minutes=60,
            total_marks=10.0,
            status=ExamStatus.PUBLISHED,
            attempt_policy=AttemptPolicyType.ONE_ATTEMPT,
            max_attempts=1,
            created_by_id=faculty_id
        )
        db.add(exam)

        q1_id = str(uuid.uuid4())
        q1 = Question(
            id=q1_id,
            exam_id=exam_id,
            question_type=QuestionType.MCQ,
            question_text="What is the Turing Test designed to evaluate?",
            options=["Machine Intelligence", "Screen Brightness", "CPU Clock Speed", "Battery Life"],
            correct_answer="Machine Intelligence",
            marks=5.0,
            order_index=1
        )
        q2_id = str(uuid.uuid4())
        q2 = Question(
            id=q2_id,
            exam_id=exam_id,
            question_type=QuestionType.SHORT_ANSWER,
            question_text="Explain the ethical implications of autonomous decision making in medical diagnoses.",
            options=[],
            correct_answer="Explain liability, patient consent, and algorithmic transparency.",
            marks=5.0,
            order_index=2
        )
        db.add_all([q1, q2])
        await db.commit()

    faculty_token = create_access_token(faculty_id, UserRole.FACULTY)
    other_faculty_token = create_access_token(other_faculty_id, UserRole.FACULTY)
    student_token = create_access_token(student_id, UserRole.STUDENT)
    other_student_token = create_access_token(other_student_id, UserRole.STUDENT)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        stu_headers = {"Authorization": f"Bearer {student_token}"}
        other_stu_headers = {"Authorization": f"Bearer {other_student_token}"}
        fac_headers = {"Authorization": f"Bearer {faculty_token}"}
        other_fac_headers = {"Authorization": f"Bearer {other_faculty_token}"}

        # 2. Student starts attempt
        res = await client.post(f"/api/v1/exams/{exam_id}/attempts", json={}, headers=stu_headers)
        assert res.status_code == 201, res.text
        att_data = res.json()
        attempt_id = att_data["id"]

        # Simulate pre-exam identity verification audit flag
        async with AsyncSessionLocal() as db:
            from app.features.attempts.models import ExamAttempt
            att_rec = await db.get(ExamAttempt, attempt_id)
            att_rec.identity_verified = True
            await db.commit()

        # 3. Student answers MCQ and Short Answer
        res = await client.post(
            f"/api/v1/attempts/{attempt_id}/answers",
            json={"question_id": q1_id, "selected_option": "Machine Intelligence"},
            headers=stu_headers
        )
        assert res.status_code == 200

        res = await client.post(
            f"/api/v1/attempts/{attempt_id}/answers",
            json={"question_id": q2_id, "answer_text": "Autonomous medical systems raise questions about doctor liability and explainability."},
            headers=stu_headers
        )
        assert res.status_code == 200
        sa_ans_id = res.json()["id"]

        # 4. Student submits exam
        res = await client.post(f"/api/v1/attempts/{attempt_id}/submit", headers=stu_headers)
        assert res.status_code == 200
        submit_data = res.json()
        assert submit_data["status"] == "SUBMITTED"
        assert submit_data["correct_mcq_count"] == 1
        assert submit_data["total_score"] == 5.0  # MCQ scored automatically
        assert submit_data["max_possible_score"] == 10.0

        # 5. BUG 2 VERIFICATION: Student result re-entry
        # Direct navigation to /my-result without restarting attempt
        res = await client.get(f"/api/v1/exams/{exam_id}/my-result", headers=stu_headers)
        assert res.status_code == 200
        my_res = res.json()
        assert my_res["attempt_id"] == attempt_id
        assert my_res["total_score"] == 5.0
        assert my_res["evaluation_status"] == "NEEDS_GRADING"
        assert len(my_res["questions"]) == 2

        # Check question details in student review
        sa_q_item = next(q for q in my_res["questions"] if q["question_id"] == q2_id)
        assert sa_q_item["answer_text"] == "Autonomous medical systems raise questions about doctor liability and explainability."
        assert sa_q_item["marks_awarded"] is None

        # Verify other student CANNOT view Alice's result via /attempts/{attempt_id}/review
        res = await client.get(f"/api/v1/attempts/{attempt_id}/review", headers=other_stu_headers)
        assert res.status_code == 403

        # Verify Alice's completed results list
        res = await client.get("/api/v1/student/results", headers=stu_headers)
        assert res.status_code == 200
        stu_results = res.json()
        assert len(stu_results) >= 1
        assert stu_results[0]["exam_id"] == exam_id
        assert stu_results[0]["total_score"] == 5.0

        # 6. BUG 1 VERIFICATION: Faculty Gradebook visibility
        # Owner faculty can view gradebook
        res = await client.get(f"/api/v1/exams/{exam_id}/gradebook", headers=fac_headers)
        assert res.status_code == 200
        gb_data = res.json()
        assert gb_data["total_submissions"] == 1
        assert len(gb_data["entries"]) == 1
        entry = gb_data["entries"][0]
        assert entry["student"]["name"] == "Alice Student"
        assert entry["total_score"] == 5.0
        assert entry["max_possible_score"] == 10.0
        assert entry["percentage"] == 50.0
        assert entry["evaluation_status"] == "NEEDS_GRADING"

        # Unauthorized faculty CANNOT view gradebook for another's exam
        res = await client.get(f"/api/v1/exams/{exam_id}/gradebook", headers=other_fac_headers)
        assert res.status_code == 403

        # Faculty recent results list
        res = await client.get("/api/v1/faculty/results/recent", headers=fac_headers)
        assert res.status_code == 200
        recent = res.json()
        assert any(r["attempt_id"] == attempt_id for r in recent)

        # 7. BUG 3 VERIFICATION: Short-Answer Manual Grading
        # Negative marks rejected
        res = await client.patch(
            f"/api/v1/attempts/{attempt_id}/answers/{sa_ans_id}/grade",
            json={"marks_awarded": -1.0},
            headers=fac_headers
        )
        assert res.status_code == 400
        assert "negative" in res.json()["detail"].lower()

        # Marks exceeding question max (5.0) rejected
        res = await client.patch(
            f"/api/v1/attempts/{attempt_id}/answers/{sa_ans_id}/grade",
            json={"marks_awarded": 7.5},
            headers=fac_headers
        )
        assert res.status_code == 400
        assert "cannot exceed" in res.json()["detail"].lower()

        # Unauthorized faculty cannot grade
        res = await client.patch(
            f"/api/v1/attempts/{attempt_id}/answers/{sa_ans_id}/grade",
            json={"marks_awarded": 4.0},
            headers=other_fac_headers
        )
        assert res.status_code == 403

        # Owner faculty grades short answer with 4.5 marks out of 5.0
        res = await client.patch(
            f"/api/v1/attempts/{attempt_id}/answers/{sa_ans_id}/grade",
            json={"marks_awarded": 4.5},
            headers=fac_headers
        )
        assert res.status_code == 200
        grade_resp = res.json()
        assert grade_resp["marks_awarded"] == 4.5
        assert grade_resp["attempt_total_score"] == 9.5  # 5.0 (MCQ) + 4.5 (Short Answer)
        assert grade_resp["evaluation_status"] == "EVALUATED"

        # 8. Check that gradebook reflects updated marks
        res = await client.get(f"/api/v1/exams/{exam_id}/gradebook", headers=fac_headers)
        assert res.status_code == 200
        updated_entry = res.json()["entries"][0]
        assert updated_entry["total_score"] == 9.5
        assert updated_entry["percentage"] == 95.0
        assert updated_entry["evaluation_status"] == "EVALUATED"

        # 9. Check that student result re-entry reflects updated score
        res = await client.get(f"/api/v1/exams/{exam_id}/my-result", headers=stu_headers)
        assert res.status_code == 200
        stu_updated_res = res.json()
        assert stu_updated_res["total_score"] == 9.5
        assert stu_updated_res["percentage"] == 95.0
        assert stu_updated_res["evaluation_status"] == "EVALUATED"
        sa_item = next(q for q in stu_updated_res["questions"] if q["question_id"] == q2_id)
        assert sa_item["marks_awarded"] == 4.5
