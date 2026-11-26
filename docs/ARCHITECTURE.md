# ExamGuard AI System Architecture

## Application boundaries

| Layer | Responsibilities | Source |
| --- | --- | --- |
| Student, faculty, and admin web interfaces | Role navigation, exam authoring and delivery, media setup, live monitoring, review and appeals | [App Router pages](../frontend/app), [frontend feature modules](../frontend/features) |
| HTTP API | Authentication, roles and record access, CRUD, attempt transitions, evidence ingestion, grading and final decisions | [FastAPI router registration](../backend/app/main.py) |
| Exam-room WebSocket | Candidate presence, monitoring updates, peer signaling, and live incident updates | [Attempts router](../backend/app/features/attempts/router.py), [signaling manager](../backend/app/features/proctoring/signaling.py) |
| Live media | Candidate webcam, microphone, and supported screen tracks via LiveKit or peer-to-peer WebRTC | [Frontend media hooks](../frontend/features/proctoring/hooks), [LiveKit token service](../backend/app/features/proctoring/sfu.py) |
| Persistent and transient data | PostgreSQL records, Redis refresh-token state with process-local fallback, filesystem uploads and evidence | [Database setup](../backend/app/core/database.py), [Redis session service](../backend/app/core/redis.py) |

The Next.js middleware redirects users by session and role. The backend route and service checks govern API access. Access-token lifetime is configurable. The sample environment sets 15 minutes, while the default in the settings class is 480 minutes. Refresh tokens rotate and expire after seven days by default. WebSocket room state and continuous monitoring trackers live in backend process memory.

## Exam authoring and delivery

Faculty define exam availability, duration, scoring, assignment, and attempt limits. The attempt policy values are `ONE_ATTEMPT`, `LIMITED_ATTEMPTS`, and `UNLIMITED_ATTEMPTS`. Question authoring supports MCQ and short-answer items. The import workflow previews and validates rows before saving them. Publishing checks the paper configuration before assigned students can start it.

The student entry flow includes instructions, identity verification against the registered photo, and camera and microphone setup. Desktop screen sharing depends on browser support and examination setup. The student workspace offers navigation, review markers, autosave, and a countdown. The backend persists the deadline and returns the active attempt for an eligible rejoin. A PostgreSQL partial unique index limits each student and exam pair to a single in-progress attempt row. Session and rejoin logic handles access to the existing row. Targeted and exam-wide re-exam grants extend eligibility, and exam-wide consumption is tracked per student.

Submission persists grading and attempt state, calculates MCQ marks, and leaves short-answer responses for manual review where applicable. Evaluation, integrity and publication are distinct fields on the attempt. Student-facing history and review responses apply publication and disqualification rules.

## Media and evidence

- **Identity and visual checks.** [Identity verification](../backend/app/features/identity/service.py) decodes and normalizes uploaded images, detects faces with YuNet, and compares SFace features by cosine similarity. [Continuous monitoring](../backend/app/features/proctoring/service.py) processes sampled webcam frames and uses confirmation windows and cooldowns for repeated signals. [Vision utilities](../backend/app/features/proctoring/vision.py) include head-pose estimation and NanoDet integration. Face count, identity similarity, head pose and object detections depend on frame quality and model availability.
- **Browser and audio checks.** The [lockdown hook](../frontend/features/proctoring/hooks/useExamLockdown.ts) records focus, visibility, and fullscreen events. [Media setup](../frontend/features/proctoring/hooks/useExamMedia.ts) tracks device and share state. [Voice activity detection](../frontend/features/proctoring/hooks/useAudioVAD.ts) uses microphone signal level and spectral heuristics. [Environment checks](../frontend/features/proctoring/hooks/useEnvironmentIntegrity.ts) act on browser-exposed signals, whose availability varies.
- **Live transport.** With SFU enabled, the API supplies the browser-facing LiveKit URL and room token. Candidates publish media and faculty subscribe. The exam WebSocket still carries operational messages. The peer path uses offers, answers, and ICE candidates through the room WebSocket. Diagnose API, signaling, and media connectivity independently.
- **Evidence.** Observations are persisted as events. Images or supported clips may be stored on disk and referenced by event records. The [screen capture hook](../frontend/features/proctoring/hooks/useScreenSnapshotCapture.ts) creates event-driven and periodic snapshots from the shared track. The API archives these as `SCREEN_SNAPSHOT` events for review. A snapshot is a visual record and carries a zero base risk weight.

## Risk scoring and post-exam review

[Risk scoring](../backend/app/features/proctoring/risk_engine.py) processes deduplicated incidents using event-specific weights, confidence, duration, classification, and severity. Sustained absence and sustained multiple-person detections have specific duration branches. Monitoring interruptions carry zero base risk weight. The live score is bounded from 0 to 100, with band boundaries at 30, 50, and 75. Risk updates and alerts support monitoring, while browser and media lock overlays follow their own state.

[Aggregation](../backend/app/features/proctoring/aggregation.py) combines attempt-wide evidence, using confidence and corroboration in addition to risk bands. [Investigation handling](../backend/app/features/proctoring/investigation.py) stores an assessment and a SHA-256 audit digest of the selected assessment payload. The background flow preserves existing manual faculty decisions.

| Investigation verdict | Effect |
| --- | --- |
| `AUTO_CLEARED` | Clears integrity and can publish the result when the exam policy allows it. |
| `PENDING_REVIEW` | Routes the submission for faculty review. |
| `AUTO_DISQUALIFIED` | Packages a recommended disqualification, sets urgent review priority, and leaves integrity pending faculty review. |

Faculty can review incidents and their evidence, issue a decision, and control result release. Incorrectly flagged incidents can be marked as false positives, which triggers risk recalculation in the incident review flow. Students can appeal eligible disqualifications. An approved appeal clears the disqualification and returns publication to `UNPUBLISHED` for a separate release decision.

## Persistence model

| Concern | Tables |
| --- | --- |
| Accounts and learning groups | `users`, `student_profiles`, `faculty_profiles`, `profile_edit_permissions` |
| Exam and additional attempts | `exams`, `questions`, `exam_reexam_permissions`, `exam_reexam_consumptions` |
| Exam execution | `exam_attempts`, `answers`, `exam_violations`, `exam_media_sessions` |
| Detection and monitoring | `proctoring_events`, `proctoring_incidents`, `student_risk_scores`, `risk_score_history`, `faculty_alerts` |
| Investigation and result workflow | `examination_investigations`, `faculty_reviews`, `disqualification_records`, `notifications` |

An exam owns questions and links to its attempts. An attempt links a student and exam to answers, media state, and integrity records. Incidents combine related observations for scoring, and investigations summarize the evidence available for an attempt. Disqualification records carry appeal state. Use the SQLAlchemy model declarations for exact keys and cardinalities.

## Selected API routes

Paths below are relative to `/api/v1`. Running the backend exposes the complete HTTP schema at `/docs`.

| Method | Route | Function |
| --- | --- | --- |
| POST | `/exams/{exam_id}/publish` | Validate and publish an exam |
| POST | `/exams/{exam_id}/attempts` | Start or resume an attempt |
| POST | `/attempts/{attempt_id}/answers` | Save an answer |
| POST | `/attempts/{attempt_id}/submit` | Submit an attempt |
| WS | `/exams/{exam_id}/ws` | Join the exam signaling and monitoring room |
| POST | `/identity/verify` | Check the candidate photo |
| POST | `/proctoring/sfu/token` | Issue room configuration and token |
| POST | `/proctoring/continuous-verify` | Analyse a sampled webcam frame |
| POST | `/proctoring/screen-snapshot` | Archive a screen frame |
| GET | `/proctoring/risk/{attempt_id}` | Read attempt risk |
| GET | `/proctoring/investigations/{attempt_id}` | Read a post-exam investigation |
| POST | `/proctoring/investigations/{attempt_id}/decision` | Record a faculty decision |
| POST | `/attempts/{attempt_id}/publish-result` | Publish an attempt result |
| GET | `/student/results` | List student result history |
| POST | `/student/attempts/{attempt_id}/appeal` | Request appeal review |
| POST | `/faculty/attempts/{attempt_id}/appeal/decision` | Resolve an appeal |

## Implementation boundaries

The project uses local file storage for media evidence. Profile uploads are served through a static mount. The evidence retrieval route has a permissive fallback and requires authorization hardening before handling real examination evidence in a public deployment. Review [the evidence route](../backend/app/features/proctoring/router.py) and [the application mount](../backend/app/main.py) when assessing data access.

A score or detector flag supports review of a specific attempt. Accuracy, false-positive rates, latency, throughput and device compatibility require measured results from a documented setup. See the [cross-device guide](CROSS_DEVICE_TESTING.md) and the [backend tests](../backend/tests) for existing verification paths.
