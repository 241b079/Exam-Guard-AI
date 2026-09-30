import asyncio
import uuid
import httpx
from app.features.users.models import User
from app.features.exams.models import Exam
from app.features.questions.models import Question
from app.features.attempts.models import ExamAttempt, Answer, ExamViolation, ExamMediaSession
from app.core.database import AsyncSessionLocal

BASE_URL = "http://127.0.0.1:8000"

async def run_live_e2e_verification():
    uid = uuid.uuid4().hex[:8]
    fac_email = f"faculty_{uid}@test.com"
    stu_email = f"student_{uid}@test.com"

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        print("\n--- STEP 1: Faculty Authentication ---")
        fac_reg = await client.post("/api/v1/auth/register", json={
            "name": "Prof Live",
            "email": fac_email,
            "password": "password123",
            "role": "FACULTY"
        })
        assert fac_reg.status_code in [200, 201], f"Faculty register failed: {fac_reg.text}"

        fac_login = await client.post("/api/v1/auth/login", json={
            "email": fac_email,
            "password": "password123"
        })
        assert fac_login.status_code == 200, f"Faculty login failed: {fac_login.text}"
        faculty_token = fac_login.json()["access_token"]
        fac_headers = {"Authorization": f"Bearer {faculty_token}"}
        print("✓ Faculty registered and authenticated successfully.")

        print("\n--- STEP 2: Student Authentication ---")
        stu_reg = await client.post("/api/v1/auth/register", json={
            "name": "Deepak Student",
            "email": stu_email,
            "password": "password123",
            "role": "STUDENT"
        })
        assert stu_reg.status_code in [200, 201], f"Student register failed: {stu_reg.text}"

        stu_login = await client.post("/api/v1/auth/login", json={
            "email": stu_email,
            "password": "password123"
        })
        assert stu_login.status_code == 200, f"Student login failed: {stu_login.text}"
        student_token = stu_login.json()["access_token"]
        stu_headers = {"Authorization": f"Bearer {student_token}"}
        print("✓ Student registered and authenticated successfully.")

        print("\n--- STEP 3: Faculty Creates Exam with MCQ + Short Answer ---")
        create_exam_res = await client.post("/api/v1/exams", json={
            "title": "Live Verification Exam (MCQ + Short Answer)",
            "description": "Comprehensive test of Bugs 1, 2, and 3",
            "duration_minutes": 45,
            "attempt_policy": "ONE_ATTEMPT",
            "max_attempts": 1,
            "max_rejoins": 2
        }, headers=fac_headers)
        assert create_exam_res.status_code in [200, 201], f"Create exam failed: {create_exam_res.text}"
        exam_id = create_exam_res.json()["id"]

        # Add Question 1: MCQ (5 marks)
        q1_res = await client.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "MCQ",
            "question_text": "What protocol powers real-time media streaming in WebRTC?",
            "options": ["RTP/SRTP", "FTP", "SMTP", "Telnet"],
            "correct_answer": "RTP/SRTP",
            "marks": 5.0,
            "order_index": 1
        }, headers=fac_headers)
        assert q1_res.status_code in [200, 201], f"Create Q1 failed: {q1_res.text}"
        q1_id = q1_res.json()["id"]

        # Add Question 2: SHORT_ANSWER (5 marks)
        q2_res = await client.post(f"/api/v1/exams/{exam_id}/questions", json={
            "question_type": "SHORT_ANSWER",
            "question_text": "Describe the difference between symmetric and asymmetric encryption.",
            "options": [],
            "correct_answer": "Symmetric uses a single shared key; asymmetric uses a public/private keypair.",
            "marks": 5.0,
            "order_index": 2
        }, headers=fac_headers)
        assert q2_res.status_code in [200, 201], f"Create Q2 failed: {q2_res.text}"
        q2_id = q2_res.json()["id"]

        # Publish Exam
        pub_res = await client.post(f"/api/v1/exams/{exam_id}/publish", headers=fac_headers)
        assert pub_res.status_code == 200, f"Publish exam failed: {pub_res.text}"
        print(f"✓ Exam created and published (ID: {exam_id}, 10 total marks).")

        print("\n--- STEP 4: Student Starts Exam & Answers Questions ---")
        start_res = await client.post(f"/api/v1/exams/{exam_id}/attempts", json={}, headers=stu_headers)
        assert start_res.status_code == 201, f"Start attempt failed: {start_res.text}"
        attempt_id = start_res.json()["id"]

        # Simulate identity verification for proctoring audit
        async with AsyncSessionLocal() as db:
            att_obj = await db.get(ExamAttempt, attempt_id)
            att_obj.identity_verified = True
            await db.commit()

        # Answer MCQ correctly
        ans1_res = await client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
            "question_id": q1_id,
            "selected_option": "RTP/SRTP"
        }, headers=stu_headers)
        assert ans1_res.status_code == 200, f"Save answer 1 failed: {ans1_res.text}"

        # Answer Short Answer with descriptive response
        ans2_res = await client.post(f"/api/v1/attempts/{attempt_id}/answers", json={
            "question_id": q2_id,
            "answer_text": "Symmetric encryption uses the same secret key for encryption and decryption, whereas asymmetric encryption uses a public key to encrypt and a private key to decrypt."
        }, headers=stu_headers)
        assert ans2_res.status_code == 200, f"Save answer 2 failed: {ans2_res.text}"
        sa_answer_id = ans2_res.json()["id"]
        print("✓ Student answered MCQ and Short Answer.")

        print("\n--- STEP 5: Student Submits Exam ---")
        submit_res = await client.post(f"/api/v1/attempts/{attempt_id}/submit", headers=stu_headers)
        assert submit_res.status_code == 200, f"Submit attempt failed: {submit_res.text}"
        sub_data = submit_res.json()
        assert sub_data["total_score"] == 5.0  # MCQ auto-graded
        assert sub_data["max_possible_score"] == 10.0
        print(f"✓ Exam submitted. Auto-score: {sub_data['total_score']}/{sub_data['max_possible_score']}")

        print("\n--- STEP 6: VERIFY BUG 2 (Student Result Re-entry & History) ---")
        # Direct result re-entry without 400 error
        my_res = await client.get(f"/api/v1/exams/{exam_id}/my-result", headers=stu_headers)
        assert my_res.status_code == 200, f"Result re-entry failed: {my_res.text}"
        result_payload = my_res.json()
        assert result_payload["attempt_id"] == attempt_id
        assert result_payload["total_score"] == 5.0
        assert result_payload["evaluation_status"] == "NEEDS_GRADING"
        assert len(result_payload["questions"]) == 2
        print("✓ Student successfully re-entered result page without 400 error.")

        # Student completed results list for dashboard
        hist_res = await client.get("/api/v1/student/results", headers=stu_headers)
        assert hist_res.status_code == 200, f"Student results history failed: {hist_res.text}"
        hist_list = hist_res.json()
        assert any(item["exam_id"] == exam_id for item in hist_list)
        print("✓ Completed exam appears in Student Dashboard recent results history.")

        print("\n--- STEP 7: VERIFY BUG 1 (Faculty Gradebook Visibility) ---")
        gb_res = await client.get(f"/api/v1/exams/{exam_id}/gradebook", headers=fac_headers)
        assert gb_res.status_code == 200, f"Faculty gradebook failed: {gb_res.text}"
        gb_data = gb_res.json()
        assert gb_data["total_submissions"] == 1
        entry = gb_data["entries"][0]
        assert entry["student"]["email"] == stu_email
        assert entry["total_score"] == 5.0
        assert entry["max_possible_score"] == 10.0
        assert entry["percentage"] == 50.0
        assert entry["evaluation_status"] == "NEEDS_GRADING"
        print(f"✓ Student attempt appears in Faculty Gradebook: Score {entry['total_score']}/{entry['max_possible_score']} ({entry['percentage']}%), Status: {entry['evaluation_status']}")

        # Faculty recent results list for dashboard
        fac_rec_res = await client.get("/api/v1/faculty/results/recent", headers=fac_headers)
        assert fac_rec_res.status_code == 200
        assert any(e["attempt_id"] == attempt_id for e in fac_rec_res.json())
        print("✓ Student attempt appears in Faculty Dashboard recent results list.")

        print("\n--- STEP 8: VERIFY BUG 3 (Short-Answer Manual Evaluation) ---")
        # Validate negative marks rejection
        bad_res1 = await client.patch(f"/api/v1/attempts/{attempt_id}/answers/{sa_answer_id}/grade", json={
            "marks_awarded": -2.0
        }, headers=fac_headers)
        assert bad_res1.status_code == 400
        print("✓ Negative marks correctly rejected with HTTP 400.")

        # Validate exceeding max marks rejection
        bad_res2 = await client.patch(f"/api/v1/attempts/{attempt_id}/answers/{sa_answer_id}/grade", json={
            "marks_awarded": 8.0
        }, headers=fac_headers)
        assert bad_res2.status_code == 400
        print("✓ Marks exceeding max marks correctly rejected with HTTP 400.")

        # Faculty assigns 4.0 marks to short answer response
        grade_res = await client.patch(f"/api/v1/attempts/{attempt_id}/answers/{sa_answer_id}/grade", json={
            "marks_awarded": 4.0
        }, headers=fac_headers)
        assert grade_res.status_code == 200, f"Grading failed: {grade_res.text}"
        g_data = grade_res.json()
        assert g_data["marks_awarded"] == 4.0
        assert g_data["attempt_total_score"] == 9.0  # 5.0 MCQ + 4.0 Short Answer
        assert g_data["evaluation_status"] == "EVALUATED"
        print(f"✓ Manual grade saved. Total score recalculated to: {g_data['attempt_total_score']}/{g_data['attempt_max_score']} (Status: {g_data['evaluation_status']})")

        print("\n--- STEP 9: Cross-Check Gradebook and Student Views for Consistency ---")
        # Check Faculty Gradebook reflects updated score
        gb_updated = await client.get(f"/api/v1/exams/{exam_id}/gradebook", headers=fac_headers)
        assert gb_updated.status_code == 200
        u_entry = gb_updated.json()["entries"][0]
        assert u_entry["total_score"] == 9.0
        assert u_entry["percentage"] == 90.0
        assert u_entry["evaluation_status"] == "EVALUATED"
        print(f"✓ Faculty Gradebook shows updated score: {u_entry['total_score']}/10.0 (90%) - EVALUATED.")

        # Check Student Result Re-entry reflects updated score
        stu_revisit = await client.get(f"/api/v1/exams/{exam_id}/my-result", headers=stu_headers)
        assert stu_revisit.status_code == 200
        s_data = stu_revisit.json()
        assert s_data["total_score"] == 9.0
        assert s_data["percentage"] == 90.0
        assert s_data["evaluation_status"] == "EVALUATED"
        sa_item = next(q for q in s_data["questions"] if q["question_id"] == q2_id)
        assert sa_item["marks_awarded"] == 4.0
        print(f"✓ Student Re-entry shows updated score: {s_data['total_score']}/10.0 (90%) - EVALUATED.")

        print("\n==============================================")
        print("ALL 3 CRITICAL BUGS VERIFIED COMPLETELY & WORKING!")
        print("==============================================\n")

if __name__ == "__main__":
    asyncio.run(run_live_e2e_verification())
