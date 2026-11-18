import os
import urllib.request
from typing import Tuple, List, Optional
import cv2
import numpy as np

from app.core.logging import logger

MODELS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "identity", "models")
)
NANODET_MODEL_PATH = os.path.join(MODELS_DIR, "object_detection_nanodet.onnx")
NANODET_URL = (
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/"
    "object_detection_nanodet/object_detection_nanodet_2022nov.onnx"
)

# 3D facial landmark points (eyes, nose tip, mouth corners in mm)
HEAD_MODEL_POINTS_5 = np.array([
    [-30.0, -30.0, -30.0],  # Right eye
    [30.0, -30.0, -30.0],   # Left eye
    [0.0, 0.0, 0.0],        # Nose tip
    [-20.0, 30.0, -30.0],   # Right mouth corner
    [20.0, 30.0, -30.0],    # Left mouth corner
], dtype=np.float64)

# Prohibited object classes in exam area (COCO dataset)
PROHIBITED_COCO_CLASSES = {
    67: "CELL_PHONE",
    73: "BOOK",
    63: "LAPTOP",
}


def estimate_head_pose(
    img_shape: Tuple[int, int],
    face: np.ndarray,
    yaw_threshold: float = 38.0,
    pitch_low: float = -28.0,
    pitch_high: float = 30.0,
) -> Tuple[float, float, float, bool]:
    """
    Computes pitch, yaw, and roll from YuNet 5 facial landmarks using cv2.solvePnP with SQPNP.
    Returns: (pitch, yaw, roll, is_looking_away)
    """
    h, w = img_shape[:2]
    focal_length = float(w)
    center = (float(w) / 2.0, float(h) / 2.0)
    cam_mat = np.array([
        [focal_length, 0.0, center[0]],
        [0.0, focal_length, center[1]],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    image_points = np.array([
        [float(face[4]), float(face[5])],    # right eye
        [float(face[6]), float(face[7])],    # left eye
        [float(face[8]), float(face[9])],    # nose tip
        [float(face[10]), float(face[11])],  # right mouth corner
        [float(face[12]), float(face[13])],  # left mouth corner
    ], dtype=np.float64)

    try:
        success, rvec, tvec = cv2.solvePnP(
            HEAD_MODEL_POINTS_5,
            image_points,
            cam_mat,
            dist_coeffs,
            flags=cv2.SOLVEPNP_SQPNP
        )
        if not success:
            return 0.0, 0.0, 0.0, False

        rmat, _ = cv2.Rodrigues(rvec)
        angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
        pitch = float(angles[0])
        yaw = float(angles[1])
        roll = float(angles[2])

        is_looking_away = abs(yaw) > yaw_threshold or pitch < pitch_low or pitch > pitch_high
        return pitch, yaw, roll, is_looking_away
    except Exception as e:
        logger.debug(f"Head pose estimation skipped/failed: {e}")
        return 0.0, 0.0, 0.0, False


class NanoDetDetector:
    """Lightweight 3.8MB NanoDet ONNX object detector for proctoring violation detection."""

    _instance: Optional["NanoDetDetector"] = None

    def __init__(self, model_path: str = NANODET_MODEL_PATH):
        self.strides = (8, 16, 32)
        self.image_shape = (416, 416)
        self.reg_max = 7
        self.prob_threshold = 0.35
        self.iou_threshold = 0.6
        self.project = np.arange(self.reg_max + 1)
        self.mean = np.array([103.53, 116.28, 123.675], dtype=np.float32).reshape(1, 1, 3)
        self.std = np.array([57.375, 57.12, 58.395], dtype=np.float32).reshape(1, 1, 3)

        self._ensure_model(model_path)
        self.net = cv2.dnn.readNet(model_path)

        self.anchors_mlvl = []
        for s in self.strides:
            feat_h, feat_w = int(self.image_shape[0] / s), int(self.image_shape[1] / s)
            shift_x = np.arange(0, feat_w) * s
            shift_y = np.arange(0, feat_h) * s
            xv, yv = np.meshgrid(shift_x, shift_y)
            cx = xv.flatten() + 0.5 * (s - 1)
            cy = yv.flatten() + 0.5 * (s - 1)
            self.anchors_mlvl.append(np.column_stack((cx, cy)))

    @classmethod
    def _ensure_model(cls, path: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if not os.path.exists(path) or os.path.getsize(path) < 10000:
            logger.info(f"Downloading NanoDet ONNX weight to {path}...")
            urllib.request.urlretrieve(NANODET_URL, path)
            logger.info("NanoDet ONNX model ready.")

    @classmethod
    def get_instance(cls) -> "NanoDetDetector":
        if cls._instance is None:
            cls._instance = NanoDetDetector()
        return cls._instance

    def detect_prohibited(self, img: np.ndarray) -> List[Tuple[str, float, Tuple[int, int, int, int]]]:
        """
        Detects prohibited exam materials (cell phones, books, laptops) in the frame.
        Returns: list of (class_label, confidence, (x, y, w, h))
        """
        h, w = img.shape[:2]
        resized = cv2.resize(img, self.image_shape)
        inp = resized.astype(np.float32)
        inp = (inp - self.mean) / self.std
        blob = cv2.dnn.blobFromImage(inp)
        self.net.setInput(blob)
        outs = self.net.forward(self.net.getUnconnectedOutLayersNames())

        cls_scores, bbox_preds = outs[:3], outs[3:]
        bboxes_mlvl, scores_mlvl = [], []
        for stride, cls_score, bbox_pred, anchors in zip(self.strides, cls_scores, bbox_preds, self.anchors_mlvl):
            if cls_score.ndim == 3:
                cls_score = cls_score.squeeze(axis=0)
            if bbox_pred.ndim == 3:
                bbox_pred = bbox_pred.squeeze(axis=0)
            x_exp = np.exp(bbox_pred.reshape(-1, self.reg_max + 1))
            bbox_pred = np.dot(x_exp / np.sum(x_exp, axis=1, keepdims=True), self.project).reshape(-1, 4) * stride

            points = anchors
            distance = bbox_pred
            x1 = points[:, 0] - distance[:, 0]
            y1 = points[:, 1] - distance[:, 1]
            x2 = points[:, 0] + distance[:, 2]
            y2 = points[:, 1] + distance[:, 3]
            bboxes_mlvl.append(np.column_stack([x1, y1, x2, y2]))
            scores_mlvl.append(cls_score)

        bboxes_mlvl = np.concatenate(bboxes_mlvl, axis=0)
        scores_mlvl = np.concatenate(scores_mlvl, axis=0)
        bboxes_wh = bboxes_mlvl.copy()
        bboxes_wh[:, 2:4] = bboxes_wh[:, 2:4] - bboxes_wh[:, 0:2]
        class_ids = np.argmax(scores_mlvl, axis=1)
        confidences = np.max(scores_mlvl, axis=1)

        indices = cv2.dnn.NMSBoxes(bboxes_wh.tolist(), confidences.tolist(), self.prob_threshold, self.iou_threshold)

        scale_x = w / float(self.image_shape[1])
        scale_y = h / float(self.image_shape[0])
        detected = []
        if len(indices) > 0:
            for idx in np.array(indices).flatten():
                cid = int(class_ids[idx])
                conf = float(confidences[idx])
                if cid in PROHIBITED_COCO_CLASSES and conf >= 0.40:
                    box = bboxes_mlvl[idx]
                    x1 = max(0, int(box[0] * scale_x))
                    y1 = max(0, int(box[1] * scale_y))
                    x2 = min(w, int(box[2] * scale_x))
                    y2 = min(h, int(box[3] * scale_y))
                    detected.append((PROHIBITED_COCO_CLASSES[cid], conf, (x1, y1, x2 - x1, y2 - y1)))
        return detected
