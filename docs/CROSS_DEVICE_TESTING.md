# Cross-Device Proctoring Verification

Use two browsers on separate devices to check the student attempt, faculty monitor, and post-exam review. Use a disposable database and temporary evidence directories for these checks. Create a dedicated synthetic exam and dedicated test accounts in that environment. Follow the [repository testing rules](../AGENTS.md) for teardown and never use a genuine faculty exam for a simulated attempt.

## Connect the devices

1. Start the services and the frontend and backend using the [local setup](../README.md#run-locally).
2. For a tunnel-based setup, expose the frontend and API separately over HTTPS, for example with `ngrok http 3000` and `ngrok http 8000` in separate terminals. Configure the frontend with `NEXT_PUBLIC_API_URL=https://<api-host>`. The client derives WSS from the HTTPS API URL unless `NEXT_PUBLIC_WS_URL` is set.
3. Configure the backend's `CORS_ORIGINS` to include the exact frontend HTTPS origin for the test. Restart both applications after changing their environment files.
4. Choose which transport to exercise. For LiveKit, set `LIVEKIT_URL` to a WSS endpoint reachable by both browsers, configure the matching server key and secret on the backend, and provide a reachable media path. The Compose default of `ws://localhost:7880` addresses the local device only. For a deliberate peer-to-peer run, use `SFU_ENABLED=false` and set `NEXT_PUBLIC_ICE_SERVERS` if the test network needs custom STUN or TURN configuration.

## Walk through the exam

| Step | Action | What to record |
| --- | --- | --- |
| Author and publish | As test faculty, publish the isolated exam and open its monitor. | Exam schedule and assignment, faculty signaling status, and transport selected. |
| Start | As the test student, complete the profile photo, pre-exam identity check, and camera and microphone setup. Share the entire screen on a supported desktop browser when requested. | Device and browser version, granted permissions, unsupported media capabilities, and whether the monitor receives available tracks. |
| Save and resume | Save an answer, interrupt the connection, then rejoin within policy and before the deadline. | Saved answer, attempt ID, remaining time, visible connection state, and rejoin counter where applicable. |
| Check evidence | On the isolated test attempt, trigger a supported browser event with screen sharing active. | Whether the event reaches the faculty view and the timeline contains the expected evidence. Record software state and timestamps. |
| Submit and review | Submit the exam, grade any short answer, open the investigation, and check student result visibility before and after release. | Evaluation, integrity, and publication states; evidence reviewed; visible student result after release. |
| Close | End the session and remove the test-run accounts, exam, dependent records and files, or discard the isolated environment. | Cleanup verification and any remaining blocked verification steps. |

If the faculty monitor connects but shows no media, check the API configuration, the exam-room WebSocket, the selected media transport, and browser permissions separately. A successful WebSocket connection only verifies signaling reachability. For mobile runs, record which browser media capabilities were present and which screen tests were skipped.
