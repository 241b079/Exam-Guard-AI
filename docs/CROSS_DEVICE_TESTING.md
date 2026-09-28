# Cross-Device Online Testing Guide (WebRTC Proctoring via ngrok)

This guide explains how to test the **Student → Faculty Live Proctoring** flow across two different physical devices (e.g., student on a mobile phone or laptop, and faculty on another laptop or tablet) using a public HTTPS tunnel such as `ngrok`.

---

## 1. Prerequisites

1. Two physical devices connected to the internet (e.g. Laptop A and Mobile Phone / Laptop B).
2. [ngrok](https://ngrok.com/) installed on the development machine hosting the servers.
3. PostgreSQL and Redis running locally or via Docker.

---

## 2. Architecture Overview

```
 [Student Device] (Mobile Phone / Laptop)
       │
       │ (HTTPS / WSS)
       ▼
 [ngrok Tunnels]
    ├── Frontend tunnel: https://<frontend-id>.ngrok-free.app  ──▶ Next.js (port 3000)
    └── Backend tunnel:  https://<backend-id>.ngrok-free.app   ──▶ FastAPI (port 8000)
                                                                       │
                                                            WebRTC PeerConnection
                                                            (STUN / TURN)
                                                                       │
 [Faculty Device] (Laptop / Desktop)                                   ▼
    └── Live Candidate Integrity Dashboard ◀───────────────────────────┘
```

---

## 3. Step-by-Step Setup

### Step 1: Start Backend
In the `backend` directory:
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
Backend will be running on `http://localhost:8000`.

### Step 2: Start ngrok Tunnels
Open two separate terminal windows (or use an ngrok configuration file):

**Tunnel 1: Backend API & WebSocket Signaling (port 8000)**
```bash
ngrok http 8000
```
Note the generated HTTPS forwarding URL, for example: `https://backend-abcd.ngrok-free.app`.

**Tunnel 2: Frontend App (port 3000)**
```bash
ngrok http 3000
```
Note the generated HTTPS forwarding URL, for example: `https://frontend-wxyz.ngrok-free.app`.

### Step 3: Configure Frontend Environment
In `frontend`, create or edit `.env.local` (this file is git-ignored):
```env
NEXT_PUBLIC_API_URL=https://backend-abcd.ngrok-free.app
```
*(Optional: If you use a custom TURN server for restrictive networks)*:
```env
NEXT_PUBLIC_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
```

### Step 4: Configure Backend CORS
In `backend`, your `.env` can specify:
```env
CORS_ORIGIN_REGEX=^https?://.*\.ngrok(-free)?\.app$
```
*(FastAPI's CORSMiddleware is pre-configured to automatically allow all `*.ngrok-free.app` origins with credentials).*

### Step 5: Start Frontend
In the `frontend` directory:
```bash
npm run dev
```
Frontend will be running on `http://localhost:3000` and proxied through `https://frontend-wxyz.ngrok-free.app`.

---

## 4. Performing the Cross-Device Test

### On Device B (Faculty Laptop):
1. In your browser, open `https://frontend-wxyz.ngrok-free.app/login`.
2. Log in with a Faculty account (or register with role `FACULTY`).
3. Create an exam, add questions, and click **Publish Exam**.
4. Open the exam details page: `https://frontend-wxyz.ngrok-free.app/faculty/exams/<examId>`.
5. Observe the **Candidate Integrity & Live Media Monitoring** section. Signaling status should show: `Signaling Connected`.

### On Device A (Student Phone or Laptop):
1. In the mobile/external browser, open `https://frontend-wxyz.ngrok-free.app/login`.
2. Log in with an independent Student account (or register with role `STUDENT`).
3. Go to **Exams**, select the published exam, and click **Start Exam**.
4. **Step 1 (Guidelines)**: Read rules and proceed to Identity Check.
5. **Step 2 (Identity Verification)**: Take live webcam photo and verify against profile photo.
6. **Step 3 (Media Setup)**:
   - Click **Allow Camera & Microphone**: Browser will prompt for permissions. Explicitly tap **Allow**.
   - If on desktop: Click **Share Entire Screen** and select your entire screen.
   - If on mobile: The system automatically detects mobile OS and adapts gracefully.
   - Click **Continue to Exam**.

### Verify Real-Time WebRTC Media on Faculty Monitor:
- Look at the student's monitor card on the Faculty dashboard:
  - Header displays student name and green **LIVE** badge.
  - Video viewport renders the student's live camera feed.
  - Switching to **Screen** shows the student's live screen feed (if desktop).
  - Unmuting audio plays the candidate's live audio.
- Test failure & disconnect handling:
  - If student closes tab or turns off camera: Faculty card switches immediately to **Student Offline** or **Camera feed offline** without freezing.
  - Student exam does **not** prematurely submit on network reconnects or media pauses.

---

## 5. Security & Hygiene Checklist

- [x] Never commit `.env` or `.env.local` containing private tunnel URLs or tokens.
- [x] Never commit `NGROK_AUTHTOKEN`, private API keys, or TURN credentials.
- [x] Authorization is strictly enforced by the backend: students can only transmit their own exam attempt; faculty can only monitor exams they own.
- [x] WebRTC media flows directly peer-to-peer (or via STUN/TURN relays) without uploading raw webcam frames over unauthenticated REST.
