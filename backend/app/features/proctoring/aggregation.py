import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.features.proctoring.models import (
    ProctoringEvent,
    ProctoringIncident,
    StudentRiskScore,
    OverallRiskLevel,
    AIClassification,
    RiskLevel,
)
from app.features.attempts.models import ExamAttempt


# Configurable category-specific confidence thresholds
CATEGORY_CONFIDENCE_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "CELL_PHONE": {"high": 0.85, "suspicious": 0.60},
    "PHONE_DETECTED": {"high": 0.85, "suspicious": 0.60},
    "UNAUTHORIZED_OBJECT": {"high": 0.85, "suspicious": 0.60},
    "MULTIPLE_PERSON": {"high": 0.85, "suspicious": 0.60},
    "MULTIPLE_PERSON_IDENTITY_MISMATCH": {"high": 0.85, "suspicious": 0.60},
    "IDENTITY_MISMATCH": {"high": 0.85, "suspicious": 0.60},
    "LOOKING_AWAY": {"high": 0.85, "suspicious": 0.60},
    "AUDIO_ANOMALY": {"high": 0.80, "suspicious": 0.50},
    "NO_FACE": {"high": 0.80, "suspicious": 0.50},
    "TEMPORARY_ABSENCE": {"high": 0.80, "suspicious": 0.50},
    "TEMPORARILY_ABSENT": {"high": 0.80, "suspicious": 0.50},
    "SUSPICIOUS_ACTIVITY": {"high": 0.85, "suspicious": 0.60},
    "BROWSER_TAB_SWITCH": {"high": 0.90, "suspicious": 0.60},
    "FULLSCREEN_EXIT": {"high": 0.90, "suspicious": 0.60},
}

# Category display metadata and grouping
CATEGORY_METADATA: Dict[str, Dict[str, str]] = {
    "CELL_PHONE": {"group": "UNAUTHORIZED_PHONE", "label": "Unauthorized Mobile Phone"},
    "PHONE_DETECTED": {"group": "UNAUTHORIZED_PHONE", "label": "Unauthorized Mobile Phone"},
    "UNAUTHORIZED_OBJECT": {"group": "UNAUTHORIZED_OBJECT", "label": "Unauthorized Object / Study Material"},
    "MULTIPLE_PERSON": {"group": "MULTIPLE_PERSON", "label": "Multiple Persons Detected"},
    "MULTIPLE_PERSON_IDENTITY_MISMATCH": {"group": "MULTIPLE_PERSON_IDENTITY_MISMATCH", "label": "Impostor with Multiple Persons"},
    "IDENTITY_MISMATCH": {"group": "IDENTITY_MISMATCH", "label": "Candidate Identity Mismatch"},
    "LOOKING_AWAY": {"group": "LOOKING_AWAY", "label": "Gaze Aversion / Looking Away"},
    "NO_FACE": {"group": "STUDENT_ABSENT", "label": "Candidate Absence from Camera"},
    "TEMPORARY_ABSENCE": {"group": "STUDENT_ABSENT", "label": "Candidate Absence from Camera"},
    "TEMPORARILY_ABSENT": {"group": "STUDENT_ABSENT", "label": "Candidate Absence from Camera"},
    "AUDIO_ANOMALY": {"group": "AUDIO_ANOMALY", "label": "Acoustic / Speech Anomaly"},
    "PAGE_HIDDEN": {"group": "BROWSER_LOCKDOWN", "label": "Browser Tab Lost Focus"},
    "WINDOW_BLUR": {"group": "BROWSER_LOCKDOWN", "label": "Application Window Switch"},
    "FULLSCREEN_EXIT": {"group": "BROWSER_LOCKDOWN", "label": "Lockdown Fullscreen Exit"},
    "CAMERA_STOPPED": {"group": "HARDWARE_ANOMALY", "label": "Camera Feed Disconnected"},
    "MONITORING_INTERRUPTED": {"group": "TECHNICAL_INTERRUPTION", "label": "Technical Interruption"},
    "RECOVERED": {"group": "RECOVERED", "label": "Candidate Face / Focus Recovered"},
    "NORMAL_VERIFIED": {"group": "RECOVERED", "label": "Normal Identity Verified"},
}


class ExamIntegrityAggregator:
    """
    Intelligent Cheating Assessment & Multi-Factor Evidence Aggregation Engine.
    
    Aggregates all proctoring events, image captures, and incidents belonging strictly
    to a single examination attempt. Groups continuous frame detections into temporal
    episodes, distinguishes high-confidence from suspicious evidence, and deterministically
    evaluates overall examination integrity risk.
    """

    EPISODE_WINDOW_SECONDS: float = 30.0

    @classmethod
    def classify_evidence_confidence(cls, event_type: str, confidence: float) -> str:
        """
        Classifies model confidence into HIGH_CONFIDENCE, SUSPICIOUS, or LOW_CONFIDENCE
        using category-specific thresholds.
        """
        # Deterministic lockdown events are inherently system-verified
        if event_type in ("PAGE_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT", "CAMERA_STOPPED"):
            return AIClassification.HIGH_CONFIDENCE.value
        if event_type in ("MONITORING_INTERRUPTED", "MEDIA_CONNECTION_LOST", "MEDIA_CONNECTION_FAILED"):
            return AIClassification.INCONCLUSIVE.value

        thresholds = CATEGORY_CONFIDENCE_THRESHOLDS.get(
            event_type, {"high": 0.85, "suspicious": 0.60}
        )
        if confidence >= thresholds["high"]:
            return AIClassification.HIGH_CONFIDENCE.value
        elif confidence >= thresholds["suspicious"]:
            return AIClassification.SUSPICIOUS.value
        else:
            return AIClassification.LOW_CONFIDENCE.value

    @classmethod
    async def aggregate_attempt_assessment(
        cls,
        db: AsyncSession,
        attempt: ExamAttempt
    ) -> Dict[str, Any]:
        """
        Aggregates all events and incidents for attempt.id and produces a comprehensive
        examination integrity assessment.
        """
        attempt_id = attempt.id
        now = datetime.now(timezone.utc)

        # 1. Query all ProctoringEvent rows for this attempt
        events_res = await db.execute(
            select(ProctoringEvent)
            .where(ProctoringEvent.exam_attempt_id == attempt_id)
            .order_by(ProctoringEvent.detected_at.asc())
        )
        events: List[ProctoringEvent] = events_res.scalars().all()

        # 2. Query all ProctoringIncident rows for this attempt
        inc_res = await db.execute(
            select(ProctoringIncident)
            .where(ProctoringIncident.exam_attempt_id == attempt_id)
            .order_by(ProctoringIncident.started_at.asc())
        )
        incidents: List[ProctoringIncident] = inc_res.scalars().all()

        # 3. Query Risk Score record
        risk_res = await db.execute(
            select(StudentRiskScore).where(StudentRiskScore.exam_attempt_id == attempt_id)
        )
        risk_rec = risk_res.scalar_one_or_none()
        final_risk_score = risk_rec.current_score if risk_rec else 0.0

        # Build deduplicated chronological timeline by consolidating incidents and evidence events
        timeline_items = []
        covered_event_ids = set()

        # Grouping events into category buckets and temporal episodes
        category_breakdowns: Dict[str, Dict[str, Any]] = {}
        episodes: List[Dict[str, Any]] = []

        # 1. Process Authoritative Incidents first (consolidates related events)
        for inc in incidents:
            inc_type = inc.incident_type
            c_meta = CATEGORY_METADATA.get(inc_type, {"group": inc_type, "label": inc_type.replace("_", " ").title()})
            g_key = c_meta["group"]

            # Find matching raw event if one exists
            matching_ev = None
            for ev in events:
                if ev.id in covered_event_ids:
                    continue
                if ev.incident_id == inc.id:
                    matching_ev = ev
                    break
                # Fallback: same type (including absence aliases) and within 10 seconds
                is_type_match = (ev.event_type == inc_type) or (
                    ev.event_type in ("TEMPORARY_ABSENCE", "NO_FACE", "TEMPORARILY_ABSENT") and
                    inc_type in ("TEMPORARY_ABSENCE", "NO_FACE", "TEMPORARILY_ABSENT")
                )
                if is_type_match and inc.started_at:
                    ev_dt = ev.detected_at or ev.started_at or now
                    if abs((ev_dt - inc.started_at).total_seconds()) <= 10.0:
                        matching_ev = ev
                        break

            ev_id = matching_ev.id if matching_ev else inc.id
            if matching_ev:
                covered_event_ids.add(matching_ev.id)

            # Determine best evidence url
            evidence_url = inc.primary_evidence_url
            if not evidence_url or evidence_url == "/api/v1/proctoring/evidence/None" or evidence_url.endswith("/None"):
                if matching_ev and matching_ev.evidence_path:
                    evidence_url = f"/api/v1/proctoring/evidence/{matching_ev.id}"
                elif matching_ev and matching_ev.id:
                    evidence_url = f"/api/v1/proctoring/evidence/{matching_ev.id}"
                elif inc.id:
                    evidence_url = f"/api/v1/proctoring/evidence/{inc.id}"
                else:
                    evidence_url = None

            conf = max(float(inc.peak_confidence or 0.0), float(matching_ev.confidence or 0.0) if matching_ev else 0.0)
            if conf <= 0.0:
                conf = 0.95 if g_key == "STUDENT_ABSENT" else 0.85

            classification = inc.ai_classification or (
                AIClassification.CONFIRMED.value if conf >= 0.70 else AIClassification.SUSPICIOUS.value
            )

            # Extract metadata from event if available
            combined_meta = dict(inc.metadata_json or {})
            if matching_ev and matching_ev.metadata_json:
                for k, v in matching_ev.metadata_json.items():
                    if k not in combined_meta:
                        combined_meta[k] = v

            dur_sec = float(inc.duration_seconds or 0.0)
            if matching_ev and matching_ev.duration and float(matching_ev.duration) > dur_sec:
                dur_sec = float(matching_ev.duration)
            if inc.started_at and inc.ended_at:
                calc_dur = (inc.ended_at - inc.started_at).total_seconds()
                if calc_dur > dur_sec:
                    dur_sec = calc_dur

            start_iso = inc.started_at.isoformat() if inc.started_at else now.isoformat()
            explanation = inc.ai_explanation
            if not explanation and matching_ev and matching_ev.ai_explanation:
                explanation = matching_ev.ai_explanation
            if not explanation:
                if g_key == "STUDENT_ABSENT":
                    explanation = f"Candidate absent from camera view (Off screen for {int(dur_sec)}s). Dynamic absence risk applied."
                elif g_key == "MULTIPLE_PERSON":
                    explanation = f"Multiple persons detected in exam area ({int(dur_sec)}s sustained)."
                else:
                    explanation = f"Recorded {c_meta['label']}."

            inc_data = {
                "event_id": ev_id,
                "incident_id": inc.id,
                "timestamp": start_iso,
                "started_at": start_iso,
                "ended_at": inc.ended_at.isoformat() if inc.ended_at else None,
                "duration_seconds": round(dur_sec, 1),
                "event_type": inc_type,
                "incident_type": inc_type,
                "category": g_key,
                "severity": inc.severity or "MEDIUM",
                "confidence": round(conf, 2),
                "ai_classification": classification,
                "evidence_url": evidence_url,
                "face_count": (matching_ev.face_count if matching_ev else 1) or 1,
                "ai_explanation": explanation,
                "review_status": inc.review_status or "PENDING",
                "review_comment": inc.review_comment,
                "risk_contribution": inc.risk_contribution or 0.0,
                "model_name": (matching_ev.model_name if matching_ev else "Browser Lockdown Monitor") or "Vision / Security Engine",
                "model_version": (matching_ev.model_version if matching_ev else "v1.0") or "v2.1",
                "category_group": g_key,
                "category_label": c_meta["label"],
                "metadata": combined_meta,
            }
            timeline_items.append(inc_data)

            episodes.append({
                "episode_id": inc.id,
                "group_key": g_key,
                "group_label": c_meta["label"],
                "event_type": inc_type,
                "started_at": inc.started_at or now,
                "ended_at": inc.ended_at or inc.started_at or now,
                "frame_count": inc.event_count or 1,
                "peak_confidence": conf,
                "classification": classification,
                "frame_ids": [ev_id],
                "review_status": inc.review_status,
            })

            if g_key not in category_breakdowns:
                category_breakdowns[g_key] = {
                    "group_key": g_key,
                    "label": c_meta["label"],
                    "total_frames": inc.event_count or 1,
                    "independent_episodes": 1,
                    "high_confidence_count": 1 if classification in (AIClassification.HIGH_CONFIDENCE.value, AIClassification.CONFIRMED.value) else 0,
                    "suspicious_count": 1 if classification == AIClassification.SUSPICIOUS.value else 0,
                    "low_confidence_count": 1 if classification == AIClassification.LOW_CONFIDENCE.value else 0,
                    "peak_confidence": round(conf, 2),
                    "evidence_items": [inc_data],
                }
            else:
                cat_b = category_breakdowns[g_key]
                cat_b["total_frames"] += inc.event_count or 1
                cat_b["independent_episodes"] += 1
                if classification in (AIClassification.HIGH_CONFIDENCE.value, AIClassification.CONFIRMED.value):
                    cat_b["high_confidence_count"] += 1
                elif classification == AIClassification.SUSPICIOUS.value:
                    cat_b["suspicious_count"] += 1
                cat_b["peak_confidence"] = max(cat_b["peak_confidence"], round(conf, 2))
                cat_b["evidence_items"].append(inc_data)

        # 2. Add remaining standalone events not covered by an authoritative incident
        for ev in events:
            if ev.id in covered_event_ids:
                continue

            ev_type = ev.event_type
            conf = float(ev.confidence or 0.0)
            c_meta = CATEGORY_METADATA.get(ev_type, {"group": ev_type, "label": ev_type.replace("_", " ").title()})
            g_key = c_meta["group"]
            group_label = c_meta["label"]

            if ev_type in ("RECOVERED", "NORMAL_VERIFIED"):
                classification = "RESOLVED"
            else:
                classification = cls.classify_evidence_confidence(ev_type, conf)

            ev_time = ev.detected_at or ev.started_at or now
            evidence_url = ev.evidence_path
            if evidence_url and not evidence_url.startswith("http") and not evidence_url.startswith("/"):
                evidence_url = f"/api/v1/proctoring/evidence/{ev.id}"

            item_data = {
                "event_id": ev.id,
                "incident_id": ev.incident_id or ev.id,
                "timestamp": ev_time.isoformat(),
                "started_at": ev_time.isoformat(),
                "ended_at": None,
                "event_type": ev_type,
                "incident_type": ev_type,
                "category": g_key,
                "severity": ev.severity or "MEDIUM",
                "confidence": round(conf, 2),
                "ai_classification": classification,
                "evidence_url": evidence_url,
                "face_count": ev.face_count,
                "ai_explanation": ev.ai_explanation or f"Observed {group_label.lower()} with {int(conf * 100)}% detection confidence.",
                "review_status": ev.review_status or "PENDING",
                "review_comment": ev.review_comment,
                "duration_seconds": ev.duration or 0.0,
                "risk_contribution": round(conf * 10.0, 1),
                "model_name": ev.model_name or "YuNet + NanoDet + SFace",
                "model_version": ev.model_version or "v2.1",
                "category_group": g_key,
                "category_label": group_label,
                "metadata": ev.metadata_json or {},
            }
            timeline_items.append(item_data)
            episodes.append({
                "episode_id": ev.id,
                "group_key": g_key,
                "group_label": group_label,
                "event_type": ev_type,
                "started_at": ev_time,
                "ended_at": ev_time,
                "frame_count": 1,
                "peak_confidence": conf,
                "classification": classification,
                "frame_ids": [ev.id],
                "review_status": ev.review_status,
            })

            if g_key not in category_breakdowns:
                category_breakdowns[g_key] = {
                    "group_key": g_key,
                    "label": group_label,
                    "total_frames": 1,
                    "independent_episodes": 1,
                    "high_confidence_count": 1 if classification in (AIClassification.HIGH_CONFIDENCE.value, AIClassification.CONFIRMED.value) else 0,
                    "suspicious_count": 1 if classification == AIClassification.SUSPICIOUS.value else 0,
                    "low_confidence_count": 1 if classification == AIClassification.LOW_CONFIDENCE.value else 0,
                    "peak_confidence": round(conf, 2),
                    "evidence_items": [item_data],
                }
            else:
                cat_b = category_breakdowns[g_key]
                cat_b["total_frames"] += 1
                cat_b["independent_episodes"] += 1
                if classification in (AIClassification.HIGH_CONFIDENCE.value, AIClassification.CONFIRMED.value):
                    cat_b["high_confidence_count"] += 1
                elif classification == AIClassification.SUSPICIOUS.value:
                    cat_b["suspicious_count"] += 1
                cat_b["peak_confidence"] = max(cat_b["peak_confidence"], round(conf, 2))
                cat_b["evidence_items"].append(item_data)

        # Sort timeline chronologically
        timeline_items.sort(key=lambda x: x.get("started_at") or "")

        # Compute accurate, deduplicated summary counters
        total_evidence_count = len(timeline_items)
        high_confidence_count = sum(
            1 for item in timeline_items
            if item.get("ai_classification") in (AIClassification.HIGH_CONFIDENCE.value, AIClassification.CONFIRMED.value)
        )
        suspicious_count = sum(
            1 for item in timeline_items
            if item.get("ai_classification") == AIClassification.SUSPICIOUS.value
        )
        low_confidence_count = sum(
            1 for item in timeline_items
            if item.get("ai_classification") == AIClassification.LOW_CONFIDENCE.value
        )
        resolved_count = sum(
            1 for item in timeline_items
            if item.get("ai_classification") == "RESOLVED"
        )
        independent_incident_count = len(timeline_items)

        # 4. Multi-Factor Risk Assessment Algorithm
        overall_risk = cls._determine_overall_risk(
            attempt=attempt,
            category_breakdowns=category_breakdowns,
            total_evidence_count=total_evidence_count,
            independent_incident_count=independent_incident_count,
            high_confidence_count=high_confidence_count,
            suspicious_count=suspicious_count,
            final_risk_score=final_risk_score,
            episodes=episodes,
        )

        # 5. Generate Evidence-Based AI Recommendation Narrative
        recommendation = cls._generate_ai_recommendation(
            overall_risk=overall_risk,
            category_breakdowns=category_breakdowns,
            total_evidence_count=total_evidence_count,
            high_confidence_count=high_confidence_count,
            suspicious_count=suspicious_count,
            independent_incident_count=independent_incident_count,
        )

        # 6. Evaluate Auto-Disqualification for High & Critical Evidence Categories
        auto_disq, rec_verdict, disq_reason = cls._evaluate_auto_disqualification(
            overall_risk=overall_risk,
            final_risk_score=final_risk_score,
            category_breakdowns=category_breakdowns,
            independent_incident_count=independent_incident_count,
            high_confidence_count=high_confidence_count,
            suspicious_count=suspicious_count,
        )

        return {
            "overall_risk_level": overall_risk.value,
            "ai_assessment_status": "COMPLETED",
            "recommended_verdict": rec_verdict,
            "auto_disqualification_recommended": auto_disq,
            "auto_disqualification_reason": disq_reason,
            "total_evidence_count": total_evidence_count,
            "independent_incident_count": independent_incident_count,
            "high_confidence_count": high_confidence_count,
            "suspicious_count": suspicious_count,
            "low_confidence_count": low_confidence_count,
            "resolved_count": resolved_count,
            "final_risk_score": final_risk_score,
            "evidence_breakdown_json": category_breakdowns,
            "timeline_items": timeline_items,
            "episodes": episodes,
            "ai_recommendation": recommendation,
            "model_version": "v2.1",
        }

    @classmethod
    def _evaluate_auto_disqualification(
        cls,
        overall_risk: OverallRiskLevel,
        final_risk_score: float,
        category_breakdowns: Dict[str, Dict[str, Any]],
        independent_incident_count: int,
        high_confidence_count: int,
        suspicious_count: int,
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Evaluates whether an examination attempt warrants automated recommendation
        for DISQUALIFICATION based on high or critical evidence categories.
        """
        reasons = []

        phone_bucket = category_breakdowns.get("UNAUTHORIZED_PHONE", {})
        phone_high = phone_bucket.get("high_confidence_count", 0)
        phone_susp = phone_bucket.get("suspicious_count", 0)

        multi_bucket = category_breakdowns.get("MULTIPLE_PERSON", {})
        multi_high = multi_bucket.get("high_confidence_count", 0)

        impostor_bucket = category_breakdowns.get("MULTIPLE_PERSON_IDENTITY_MISMATCH", {})
        id_bucket = category_breakdowns.get("IDENTITY_MISMATCH", {})
        id_high = id_bucket.get("high_confidence_count", 0)

        absence_bucket = category_breakdowns.get("STUDENT_ABSENT", {})
        absence_items = absence_bucket.get("evidence_items", [])
        max_absence_seconds = max([float(item.get("duration_seconds") or 0.0) for item in absence_items], default=0.0)

        lockdown_bucket = category_breakdowns.get("BROWSER_LOCKDOWN", {})
        lockdown_count = lockdown_bucket.get("total_frames", 0)

        # 1. Critical Risk Level
        if overall_risk == OverallRiskLevel.CRITICAL_RISK or final_risk_score >= 75.0:
            if len(impostor_bucket.get("evidence_items", [])) > 0 or id_high >= 1:
                reasons.append("Severe candidate identity mismatch / impostor detected in camera feed")
            if phone_high >= 2:
                reasons.append(f"{phone_high} confirmed unauthorized mobile phone detections")
            if max_absence_seconds >= 60.0:
                reasons.append(f"Extended unmonitored absence from camera ({int(max_absence_seconds)}s off screen)")
            if final_risk_score >= 75.0:
                reasons.append(f"Critical composite integrity risk score ({final_risk_score:.1f}/100)")

            reason_str = "Auto-disqualification recommended due to: " + "; ".join(reasons) if reasons else f"Critical examination integrity score ({final_risk_score:.1f}/100) exceeding policy thresholds."
            return True, "DISQUALIFIED", reason_str

        # 2. High Risk Level with severe / corroborated categories
        if overall_risk == OverallRiskLevel.HIGH_RISK or final_risk_score >= 50.0:
            should_disqualify = False

            if phone_high >= 1:
                should_disqualify = True
                reasons.append(f"Confirmed unauthorized mobile phone detection ({phone_high} instance)")
            if multi_high >= 1 and (phone_susp >= 1 or lockdown_count >= 1 or max_absence_seconds >= 20.0):
                should_disqualify = True
                reasons.append("Multiple persons detected corroborated by secondary violation telemetry")
            if max_absence_seconds >= 30.0:
                should_disqualify = True
                reasons.append(f"Prolonged absence from examination view ({int(max_absence_seconds)}s off screen)")
            if final_risk_score >= 60.0:
                should_disqualify = True
                reasons.append(f"High cumulative risk score ({final_risk_score:.1f}/100)")
            elif (high_confidence_count >= 2 and independent_incident_count >= 2):
                should_disqualify = True
                reasons.append(f"Multiple independent high-confidence policy violations ({high_confidence_count} events)")

            if should_disqualify:
                reason_str = "Auto-disqualification recommended: " + "; ".join(reasons) + "."
                return True, "DISQUALIFIED", reason_str

        # 3. Moderate / Low risk
        if overall_risk == OverallRiskLevel.MODERATE_RISK:
            return False, "SUSPICIOUS", None

        return False, "CLEARED", None

    @classmethod
    def _determine_overall_risk(
        cls,
        attempt: ExamAttempt,
        category_breakdowns: Dict[str, Dict[str, Any]],
        total_evidence_count: int,
        independent_incident_count: int,
        high_confidence_count: int,
        suspicious_count: int,
        final_risk_score: float,
        episodes: List[Dict[str, Any]]
    ) -> OverallRiskLevel:
        """
        Deterministic, verifiable examination-level AI risk classification.
        
        Evaluates detected object type, independent episode frequency, model confidence,
        and corroborating factors.
        
        Crucial Invariant: Suspicious or low-confidence evidence NEVER downgrades stronger evidence.
        """
        # 1. Check for Insufficient Evidence
        exam_duration = getattr(attempt.exam, "duration_minutes", 60) if attempt.exam else 60
        if exam_duration >= 10 and total_evidence_count < 2 and independent_incident_count == 0:
            # Entire exam had no visual verification frames
            return OverallRiskLevel.INSUFFICIENT_EVIDENCE

        # Count category-specific high-confidence detections
        phone_bucket = category_breakdowns.get("UNAUTHORIZED_PHONE", {})
        phone_high = phone_bucket.get("high_confidence_count", 0)
        phone_susp = phone_bucket.get("suspicious_count", 0)
        phone_episodes = phone_bucket.get("independent_episodes", 0)

        multi_person_bucket = category_breakdowns.get("MULTIPLE_PERSON", {})
        multi_person_high = multi_person_bucket.get("high_confidence_count", 0)

        impostor_bucket = category_breakdowns.get("MULTIPLE_PERSON_IDENTITY_MISMATCH", {})
        id_mismatch_bucket = category_breakdowns.get("IDENTITY_MISMATCH", {})
        id_mismatch_high = id_mismatch_bucket.get("high_confidence_count", 0)

        # 2. Critical Risk Conditions:
        # - An impostor + multiple persons simultaneously
        # - 3 or more independent high-confidence episodes of severe violations
        # - Dynamic risk score >= 75.0
        if len(impostor_bucket.get("evidence_items", [])) > 0 or \
           final_risk_score >= 75.0 or \
           (phone_episodes >= 3 and phone_high >= 3) or \
           (multi_person_high >= 2 and id_mismatch_high >= 1):
            return OverallRiskLevel.CRITICAL_RISK

        # 3. High Risk Conditions:
        # - Any high-confidence unauthorized phone / unauthorized materials detection
        # - The user's exact scenario: 10 high-confidence phone detections + 1 suspicious detection
        # - Multiple independent high-confidence episodes
        # - Dynamic risk score >= 50.0
        if phone_high >= 1 or \
           (phone_high + phone_susp >= 5) or \
           multi_person_high >= 1 or \
           id_mismatch_high >= 1 or \
           final_risk_score >= 50.0 or \
           (high_confidence_count >= 2 and independent_incident_count >= 2):
            return OverallRiskLevel.HIGH_RISK

        # 4. Moderate Risk Conditions:
        # - Multiple suspicious detections without high-confidence corroboration
        # - Repeated tab switching / lockdown exits (>= 2)
        # - Dynamic risk score >= 30.0
        lockdown_bucket = category_breakdowns.get("BROWSER_LOCKDOWN", {})
        lockdown_count = lockdown_bucket.get("total_frames", 0)

        if suspicious_count >= 2 or \
           lockdown_count >= 2 or \
           final_risk_score >= 30.0 or \
           phone_susp >= 1:
            return OverallRiskLevel.MODERATE_RISK

        # 5. Low Risk Conditions:
        # - Single isolated anomaly (e.g. brief looking away or single brief tab switch)
        if independent_incident_count > 0 or suspicious_count == 1 or final_risk_score > 0.0:
            return OverallRiskLevel.LOW_RISK

        # 6. No Significant Concerns:
        # - Clean session with verified identity
        return OverallRiskLevel.NO_SIGNIFICANT_CONCERNS

    @classmethod
    def _generate_ai_recommendation(
        cls,
        overall_risk: OverallRiskLevel,
        category_breakdowns: Dict[str, Dict[str, Any]],
        total_evidence_count: int,
        high_confidence_count: int,
        suspicious_count: int,
        independent_incident_count: int
    ) -> str:
        """
        Generates an objective, factual narrative explanation based strictly
        on recorded evidence.
        """
        phone_bucket = category_breakdowns.get("UNAUTHORIZED_PHONE", {})
        phone_high = phone_bucket.get("high_confidence_count", 0)
        phone_susp = phone_bucket.get("suspicious_count", 0)

        multi_bucket = category_breakdowns.get("MULTIPLE_PERSON", {})
        multi_high = multi_bucket.get("high_confidence_count", 0)

        id_bucket = category_breakdowns.get("IDENTITY_MISMATCH", {})
        id_high = id_bucket.get("high_confidence_count", 0)

        lockdown_bucket = category_breakdowns.get("BROWSER_LOCKDOWN", {})
        lockdown_count = lockdown_bucket.get("total_frames", 0)

        # Special phrasing matching user prompt example when phone is detected
        if phone_high > 0 or phone_susp > 0:
            detail_parts = []
            if phone_high > 0:
                detail_parts.append(f"{phone_high} detection{'s were' if phone_high > 1 else ' was'} classified as high confidence")
            if phone_susp > 0:
                detail_parts.append(f"{phone_susp} additional suspicious event{'s' if phone_susp > 1 else ''}")

            details_str = ", with ".join(detail_parts)
            return (
                f"Multiple unauthorized mobile phone detections were recorded during the examination. "
                f"{details_str.capitalize()}. This examination has been assigned {overall_risk.value.replace('_', ' ').title()} "
                f"and requires priority faculty review."
            )

        if overall_risk == OverallRiskLevel.CRITICAL_RISK:
            return (
                f"Critical integrity risk detected across {independent_incident_count} independent incident episodes. "
                f"High-confidence anomalies ({high_confidence_count} events) indicate severe potential policy violations. "
                f"Immediate faculty review and investigation adjudication is strongly recommended."
            )

        if overall_risk == OverallRiskLevel.HIGH_RISK:
            return (
                f"High integrity risk detected with {high_confidence_count} high-confidence and {suspicious_count} "
                f"suspicious telemetry captures recorded. Examination has been flagged for priority instructor review."
            )

        if overall_risk == OverallRiskLevel.MODERATE_RISK:
            reasons = []
            if lockdown_count > 0:
                reasons.append(f"{lockdown_count} browser window/tab exit(s)")
            if suspicious_count > 0:
                reasons.append(f"{suspicious_count} suspicious behavioral event(s)")
            reason_str = " and ".join(reasons) if reasons else "observed telemetry patterns"
            return (
                f"Moderate examination risk assigned based on {reason_str}. "
                f"No confirmed high-severity device violations were detected. Recommended for standard faculty review."
            )

        if overall_risk == OverallRiskLevel.LOW_RISK:
            return (
                f"Minor isolated telemetry fluctuations observed ({independent_incident_count} event). "
                f"No persistent integrity anomalies established. Recommended for standard result clearance."
            )

        if overall_risk == OverallRiskLevel.INSUFFICIENT_EVIDENCE:
            return (
                f"Insufficient camera and proctoring telemetry captured during the examination session. "
                f"Faculty should verify network connectivity logs before publishing results."
            )

        return (
            "No significant integrity concerns detected. Continuous identity verification and proctoring telemetry "
            "remained consistent throughout the examination. Recommended for standard result publication."
        )
