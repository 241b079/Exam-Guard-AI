import json
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket

logger = logging.getLogger("exam_proctoring.signaling")


class SignalingManager:
    def __init__(self):
        # attempt_id -> student WebSocket
        self.student_sockets: Dict[str, WebSocket] = {}
        # attempt_id -> set of faculty WebSockets watching this student
        self.faculty_sockets: Dict[str, Set[WebSocket]] = {}
        # attempt_id -> cached student media status
        self.media_status_cache: Dict[str, dict] = {}

    async def connect_student(self, attempt_id: str, websocket: WebSocket):
        await websocket.accept()
        # If an existing student socket is open for this attempt (e.g. from refresh), close it
        existing = self.student_sockets.get(attempt_id)
        if existing and existing != websocket:
            try:
                await existing.close(code=1000, reason="Replaced by new connection")
            except Exception:
                pass
        self.student_sockets[attempt_id] = websocket

        # Notify any faculty currently watching this student
        faculty_watchers = self.faculty_sockets.get(attempt_id, set())
        for fac_ws in list(faculty_watchers):
            try:
                await fac_ws.send_json({
                    "type": "student_connected",
                    "attempt_id": attempt_id,
                })
            except Exception as e:
                logger.warning(f"Error notifying faculty of student connection: {e}")

        # If faculty is already connected, notify the student
        if faculty_watchers:
            try:
                await websocket.send_json({
                    "type": "faculty_connected",
                    "attempt_id": attempt_id,
                })
            except Exception:
                pass

    async def connect_faculty(self, attempt_id: str, websocket: WebSocket):
        await websocket.accept()
        if attempt_id not in self.faculty_sockets:
            self.faculty_sockets[attempt_id] = set()
        self.faculty_sockets[attempt_id].add(websocket)

        # Notify student that faculty is connected
        student_ws = self.student_sockets.get(attempt_id)
        if student_ws:
            try:
                await student_ws.send_json({
                    "type": "faculty_connected",
                    "attempt_id": attempt_id,
                })
            except Exception as e:
                logger.warning(f"Error notifying student of faculty connection: {e}")

        # Send latest media status to this faculty if available
        cached_status = self.media_status_cache.get(attempt_id)
        if cached_status:
            try:
                await websocket.send_json({
                    "type": "media_status",
                    "attempt_id": attempt_id,
                    **cached_status,
                })
            except Exception:
                pass

    async def disconnect(self, attempt_id: str, websocket: WebSocket):
        # Check student
        if self.student_sockets.get(attempt_id) == websocket:
            del self.student_sockets[attempt_id]
            faculty_watchers = self.faculty_sockets.get(attempt_id, set())
            for fac_ws in list(faculty_watchers):
                try:
                    await fac_ws.send_json({
                        "type": "student_disconnected",
                        "attempt_id": attempt_id,
                    })
                except Exception:
                    pass

        # Check faculty
        if attempt_id in self.faculty_sockets and websocket in self.faculty_sockets[attempt_id]:
            self.faculty_sockets[attempt_id].remove(websocket)
            if not self.faculty_sockets[attempt_id]:
                del self.faculty_sockets[attempt_id]
                # Notify student that no faculty is watching
                student_ws = self.student_sockets.get(attempt_id)
                if student_ws:
                    try:
                        await student_ws.send_json({
                            "type": "faculty_disconnected",
                            "attempt_id": attempt_id,
                        })
                    except Exception:
                        pass

    async def forward_to_faculty(self, attempt_id: str, message: dict):
        # Update media status cache if applicable
        if message.get("type") == "media_status":
            self.media_status_cache[attempt_id] = {
                "camera": message.get("camera", False),
                "mic": message.get("mic", False),
                "screen": message.get("screen", False),
            }

        faculty_watchers = self.faculty_sockets.get(attempt_id, set())
        for fac_ws in list(faculty_watchers):
            try:
                await fac_ws.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to forward message to faculty: {e}")

    async def forward_to_student(self, attempt_id: str, message: dict):
        student_ws = self.student_sockets.get(attempt_id)
        if student_ws:
            try:
                await student_ws.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to forward message to student: {e}")


signaling_manager = SignalingManager()
