import json
import logging
import uuid
from typing import Dict, Set, Optional, Any
from fastapi import WebSocket

logger = logging.getLogger("exam_proctoring.signaling")


class SignalingManager:
    def __init__(self):
        # Legacy mappings for backward compatibility
        self.student_sockets: Dict[str, WebSocket] = {}
        self.faculty_sockets: Dict[str, Set[WebSocket]] = {}
        self.media_status_cache: Dict[str, dict] = {}

        # Exam Room based WebRTC signaling:
        # exam_id -> { client_id: WebSocket }
        self.exam_faculty: Dict[str, Dict[str, WebSocket]] = {}
        # exam_id -> { client_id: { "websocket": WebSocket, "student_id": str, "attempt_id": str } }
        self.exam_students: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # client_id -> WebSocket
        self.client_socket: Dict[str, WebSocket] = {}
        # client_id -> exam_id
        self.client_exam: Dict[str, str] = {}
        # client_id -> role ("student" or "faculty")
        self.client_role: Dict[str, str] = {}

    async def connect_exam_faculty(self, exam_id: str, websocket: WebSocket) -> str:
        """Register a faculty connection monitoring an entire exam room."""
        await websocket.accept()
        client_id = f"fac_{uuid.uuid4().hex[:8]}"

        if exam_id not in self.exam_faculty:
            self.exam_faculty[exam_id] = {}
        self.exam_faculty[exam_id][client_id] = websocket
        self.client_socket[client_id] = websocket
        self.client_exam[client_id] = exam_id
        self.client_role[client_id] = "faculty"

        # List currently active students in this exam
        active_students = []
        for c_id, s_info in self.exam_students.get(exam_id, {}).items():
            active_students.append({
                "client_id": c_id,
                "student_id": s_info["student_id"],
                "attempt_id": s_info["attempt_id"],
            })

        # Send connected confirmation to faculty
        try:
            await websocket.send_json({
                "type": "connected",
                "client_id": client_id,
                "active_students": active_students,
            })
        except Exception as e:
            logger.warning(f"Error sending connected to faculty: {e}")

        # Notify all active students in this exam that faculty is present
        for c_id, s_info in self.exam_students.get(exam_id, {}).items():
            try:
                await s_info["websocket"].send_json({
                    "type": "faculty_joined",
                    "faculty_client_id": client_id,
                })
            except Exception as e:
                logger.warning(f"Error notifying student {c_id} of faculty join: {e}")

        logger.info(f"Faculty {client_id} connected to exam {exam_id} ({len(active_students)} active students)")
        return client_id

    async def connect_exam_student(
        self, exam_id: str, student_id: str, attempt_id: str, websocket: WebSocket
    ) -> str:
        """Register a student connection for an active exam attempt."""
        await websocket.accept()
        client_id = f"stu_{uuid.uuid4().hex[:8]}"

        if exam_id not in self.exam_students:
            self.exam_students[exam_id] = {}
        self.exam_students[exam_id][client_id] = {
            "websocket": websocket,
            "student_id": student_id,
            "attempt_id": attempt_id,
        }
        self.client_socket[client_id] = websocket
        self.client_exam[client_id] = exam_id
        self.client_role[client_id] = "student"

        # Legacy map support
        self.student_sockets[attempt_id] = websocket

        # Send connected confirmation to student
        try:
            await websocket.send_json({
                "type": "connected",
                "client_id": client_id,
            })
        except Exception as e:
            logger.warning(f"Error sending connected to student: {e}")

        # Notify all faculty watching this exam that a new student joined
        faculty_map = self.exam_faculty.get(exam_id, {})
        for fac_id, fac_ws in faculty_map.items():
            try:
                await fac_ws.send_json({
                    "type": "student_joined",
                    "client_id": client_id,
                    "student_id": student_id,
                    "attempt_id": attempt_id,
                })
            except Exception as e:
                logger.warning(f"Error notifying faculty {fac_id} of student join: {e}")

            # Notify the student of each connected faculty so offer can be initiated
            try:
                await websocket.send_json({
                    "type": "faculty_joined",
                    "faculty_client_id": fac_id,
                })
            except Exception:
                pass

        logger.info(f"Student {client_id} ({student_id}) connected to exam {exam_id}")
        return client_id

    async def route_message(self, sender_client_id: str, message: dict):
        """Route signaling messages (offers, answers, ICE candidates) between peers."""
        exam_id = self.client_exam.get(sender_client_id)
        if not exam_id:
            return

        target_client_id = message.get("target_client_id")
        msg_type = message.get("type")

        # Cache media status if applicable
        if msg_type == "media_status":
            s_info = self.exam_students.get(exam_id, {}).get(sender_client_id)
            if s_info:
                attempt_id = s_info.get("attempt_id")
                if attempt_id:
                    self.media_status_cache[attempt_id] = {
                        "camera": message.get("camera", False),
                        "mic": message.get("mic", False),
                        "screen": message.get("screen", False),
                    }

        # Targeted routing
        if target_client_id:
            target_ws = self.client_socket.get(target_client_id)
            if target_ws:
                # Add sender client_id metadata
                message["sender_client_id"] = sender_client_id

                # If sender is student, add student_id & attempt_id for faculty reference
                s_info = self.exam_students.get(exam_id, {}).get(sender_client_id)
                if s_info:
                    message["student_id"] = s_info["student_id"]
                    message["attempt_id"] = s_info["attempt_id"]

                try:
                    await target_ws.send_json(message)
                except Exception as e:
                    logger.warning(f"Error routing {msg_type} from {sender_client_id} to {target_client_id}: {e}")
            return

        # Broadcast to room if no specific target
        sender_role = self.client_role.get(sender_client_id)
        if sender_role == "student":
            # Broadcast to all faculty watching this exam
            message["sender_client_id"] = sender_client_id
            s_info = self.exam_students.get(exam_id, {}).get(sender_client_id)
            if s_info:
                message["student_id"] = s_info["student_id"]
                message["attempt_id"] = s_info["attempt_id"]

            for fac_id, fac_ws in self.exam_faculty.get(exam_id, {}).items():
                try:
                    await fac_ws.send_json(message)
                except Exception:
                    pass
        elif sender_role == "faculty":
            # Broadcast to all students in this exam
            message["sender_client_id"] = sender_client_id
            for stu_id, s_info in self.exam_students.get(exam_id, {}).items():
                try:
                    await s_info["websocket"].send_json(message)
                except Exception:
                    pass

    async def disconnect_client(self, client_id: str):
        """Clean up when a peer disconnects and inform counter-parties."""
        exam_id = self.client_exam.get(client_id)
        role = self.client_role.get(client_id)

        if not exam_id:
            return

        if role == "student":
            s_info = self.exam_students.get(exam_id, {}).pop(client_id, None)
            if s_info:
                student_id = s_info["student_id"]
                attempt_id = s_info["attempt_id"]
                self.student_sockets.pop(attempt_id, None)

                # Inform all faculty watching this exam
                for fac_id, fac_ws in self.exam_faculty.get(exam_id, {}).items():
                    try:
                        await fac_ws.send_json({
                            "type": "student_left",
                            "client_id": client_id,
                            "student_id": student_id,
                            "attempt_id": attempt_id,
                        })
                    except Exception:
                        pass
        elif role == "faculty":
            self.exam_faculty.get(exam_id, {}).pop(client_id, None)
            # Inform all students
            for stu_id, s_info in self.exam_students.get(exam_id, {}).items():
                try:
                    await s_info["websocket"].send_json({
                        "type": "faculty_left",
                        "faculty_client_id": client_id,
                    })
                except Exception:
                    pass

        self.client_socket.pop(client_id, None)
        self.client_exam.pop(client_id, None)
        self.client_role.pop(client_id, None)
        logger.info(f"Client {client_id} disconnected from exam {exam_id}")

    # Legacy method compatibility
    async def connect_student(self, attempt_id: str, websocket: WebSocket):
        await websocket.accept()
        self.student_sockets[attempt_id] = websocket

    async def connect_faculty(self, attempt_id: str, websocket: WebSocket):
        await websocket.accept()
        if attempt_id not in self.faculty_sockets:
            self.faculty_sockets[attempt_id] = set()
        self.faculty_sockets[attempt_id].add(websocket)

    async def disconnect(self, attempt_id: str, websocket: WebSocket):
        if self.student_sockets.get(attempt_id) == websocket:
            del self.student_sockets[attempt_id]
        if attempt_id in self.faculty_sockets and websocket in self.faculty_sockets[attempt_id]:
            self.faculty_sockets[attempt_id].remove(websocket)

    async def forward_to_faculty(self, attempt_id: str, message: dict):
        faculty_watchers = self.faculty_sockets.get(attempt_id, set())
        for fac_ws in list(faculty_watchers):
            try:
                await fac_ws.send_json(message)
            except Exception:
                pass

    async def forward_to_student(self, attempt_id: str, message: dict):
        student_ws = self.student_sockets.get(attempt_id)
        if student_ws:
            try:
                await student_ws.send_json(message)
            except Exception:
                pass


signaling_manager = SignalingManager()
