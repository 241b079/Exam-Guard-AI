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

        # Authoritative connection tracking: (exam_id, student_id) -> active client_id
        self.active_student_client: Dict[tuple[str, str], str] = {}
        # Replaced client_ids to prevent asynchronous cleanup from emitting false student_left
        self.replaced_clients: Set[str] = set()

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
        self,
        exam_id: str,
        student_id: str,
        attempt_id: str,
        websocket: WebSocket,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Register a student connection for an active exam attempt, safely replacing stale connections."""
        await websocket.accept()
        client_id = f"stu_{uuid.uuid4().hex[:8]}"
        meta = metadata or {}

        # 1. Single Active Connection & Stale Eviction:
        # Check if this student already has an active connection in this exam room
        existing_key = (exam_id, student_id)
        old_client_id = self.active_student_client.get(existing_key)
        is_rejoin_session = meta.get("is_rejoin", False) or bool(old_client_id) or (meta.get("rejoin_count", 0) > 0)

        if old_client_id and old_client_id in self.client_socket:
            logger.info(f"Evicting stale connection {old_client_id} for student {student_id} in exam {exam_id}")
            self.replaced_clients.add(old_client_id)
            old_ws = self.client_socket.get(old_client_id)
            # Remove from maps cleanly
            if exam_id in self.exam_students:
                self.exam_students[exam_id].pop(old_client_id, None)
            self.client_socket.pop(old_client_id, None)
            self.client_exam.pop(old_client_id, None)
            self.client_role.pop(old_client_id, None)
            if old_ws:
                try:
                    await old_ws.close(code=1000, reason="Replaced by new connection")
                except Exception:
                    pass

        # Also purge any dangling entries for this student_id in exam_students[exam_id]
        if exam_id in self.exam_students:
            dangling = [
                cid for cid, s in self.exam_students[exam_id].items()
                if s.get("student_id") == student_id and cid != client_id
            ]
            for d_cid in dangling:
                self.replaced_clients.add(d_cid)
                d_info = self.exam_students[exam_id].pop(d_cid, None)
                self.client_socket.pop(d_cid, None)
                self.client_exam.pop(d_cid, None)
                self.client_role.pop(d_cid, None)
                if d_info and d_info.get("websocket"):
                    try:
                        await d_info["websocket"].close(code=1000, reason="Replaced by new connection")
                    except Exception:
                        pass

        # 2. Register the new authoritative connection
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
        self.active_student_client[existing_key] = client_id

        # Legacy map support
        self.student_sockets[attempt_id] = websocket

        # 3. Send connected confirmation to student with authoritative backend state
        try:
            await websocket.send_json({
                "type": "connected",
                "client_id": client_id,
                "student_id": student_id,
                "attempt_id": attempt_id,
                "rejoin_count": meta.get("rejoin_count", 0),
                "max_rejoins": meta.get("max_rejoins", 2),
                "violation_count": meta.get("violation_count", 0),
            })
        except Exception as e:
            logger.warning(f"Error sending connected to student: {e}")

        # 4. Notify all faculty watching this exam with authoritative student state
        event_type = "student_rejoined" if is_rejoin_session else "student_joined"
        faculty_map = self.exam_faculty.get(exam_id, {})
        for fac_id, fac_ws in faculty_map.items():
            try:
                await fac_ws.send_json({
                    "type": event_type,
                    "client_id": client_id,
                    "student_id": student_id,
                    "attempt_id": attempt_id,
                    "rejoin_count": meta.get("rejoin_count", 0),
                    "max_rejoins": meta.get("max_rejoins", 2),
                    "violation_count": meta.get("violation_count", 0),
                    "status": meta.get("status", "IN_PROGRESS"),
                    "student_name": meta.get("student_name", ""),
                    "student_email": meta.get("student_email", ""),
                    "student_roll_number": meta.get("student_roll_number", ""),
                })
            except Exception as e:
                logger.warning(f"Error notifying faculty {fac_id} of {event_type}: {e}")

            # Notify the student of each connected faculty so WebRTC offer can be initiated
            try:
                await websocket.send_json({
                    "type": "faculty_joined",
                    "faculty_client_id": fac_id,
                })
            except Exception:
                pass

        logger.info(f"Student {client_id} ({student_id}) connected ({event_type}) to exam {exam_id}")
        return client_id

    async def broadcast_violation(self, exam_id: str, violation_data: dict):
        """Immediately broadcast a violation event to all faculty watching this exam room."""
        faculty_map = self.exam_faculty.get(exam_id, {})
        if not faculty_map:
            return

        msg = {
            "type": "violation",
            "violation": violation_data,
            "student_id": violation_data.get("student_id"),
            "attempt_id": violation_data.get("exam_attempt_id") or violation_data.get("attempt_id"),
        }
        for fac_id, fac_ws in list(faculty_map.items()):
            try:
                await fac_ws.send_json(msg)
            except Exception as e:
                logger.warning(f"Error broadcasting violation to faculty {fac_id}: {e}")

    async def broadcast_student_state(self, exam_id: str, student_id: str, state_payload: dict):
        """Broadcast state synchronization (e.g. rejoin, status update) to all faculty."""
        faculty_map = self.exam_faculty.get(exam_id, {})
        if not faculty_map:
            return

        for fac_id, fac_ws in list(faculty_map.items()):
            try:
                await fac_ws.send_json(state_payload)
            except Exception as e:
                logger.warning(f"Error broadcasting state sync to faculty {fac_id}: {e}")

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
        """Clean up when a peer disconnects, safely handling replaced and active connections."""
        # 1. If this client was explicitly replaced by a newer connection, ignore cleanup and suppress student_left
        if client_id in self.replaced_clients:
            self.replaced_clients.discard(client_id)
            self.client_socket.pop(client_id, None)
            self.client_exam.pop(client_id, None)
            self.client_role.pop(client_id, None)
            logger.info(f"Client {client_id} was replaced; suppressed student_left notification.")
            return

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

                key = (exam_id, student_id)
                # Check if this client is still the active connection for this student
                if self.active_student_client.get(key) != client_id:
                    logger.info(f"Client {client_id} for student {student_id} is no longer active; suppressed student_left.")
                    self.client_socket.pop(client_id, None)
                    self.client_exam.pop(client_id, None)
                    self.client_role.pop(client_id, None)
                    return

                # Remove from active tracking since this was the authoritative connection
                self.active_student_client.pop(key, None)

                # Check if another connection exists in exam_students
                still_connected = any(
                    s.get("student_id") == student_id
                    for s in self.exam_students.get(exam_id, {}).values()
                )
                if still_connected:
                    logger.info(f"Student {student_id} still has another connection active; suppressed student_left.")
                    self.client_socket.pop(client_id, None)
                    self.client_exam.pop(client_id, None)
                    self.client_role.pop(client_id, None)
                    return

                # Inform all faculty watching this exam that student left
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
