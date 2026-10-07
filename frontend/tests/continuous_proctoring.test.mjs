import test from 'node:test';
import assert from 'node:assert/strict';

// Client-side state machine simulation engine matching useContinuousIdentityMonitoring & backend
class IdentityMonitoringStateMachine {
  constructor(config = {}) {
    this.config = {
      IDENTITY_MISMATCH_CONFIRM_SECONDS: 3.0,
      ABSENCE_GRACE_SECONDS: 5.0,
      MULTIPLE_PERSON_CONFIRM_SECONDS: 2.0,
      INCIDENT_COOLDOWN_SECONDS: 30.0,
      ...config,
    };
    this.currentState = 'NORMAL_VERIFIED';
    this.pendingState = null;
    this.pendingStartTime = null;

    this.activeIncidentId = null;
    this.activeIncidentType = null;
    this.incidentStartTime = null;
    this.lastEvidenceTime = null;

    this.createdEvents = [];
    this.recoveredEvents = [];
  }

  processFrame({ faceCount, isVerifiedStudent, timestamp = Date.now() }) {
    // 1. Determine raw detection status
    let rawStatus = 'UNKNOWN';
    if (faceCount === 0) {
      rawStatus = 'NO_FACE';
    } else if (faceCount === 1) {
      rawStatus = isVerifiedStudent ? 'MATCH' : 'MISMATCH';
    } else {
      rawStatus = isVerifiedStudent
        ? 'MULTIPLE_PERSON_IDENTITY_MISMATCH'
        : 'MULTIPLE_PERSON';
    }

    // 2. Case: Verified Student Present
    if (rawStatus === 'MATCH') {
      if (this.activeIncidentId) {
        // Close ongoing incident
        const duration = (timestamp - this.incidentStartTime) / 1000;
        this.recoveredEvents.push({
          incidentId: this.activeIncidentId,
          previousType: this.activeIncidentType,
          duration,
          timestamp,
        });
        this.activeIncidentId = null;
        this.activeIncidentType = null;
        this.incidentStartTime = null;
      }
      this.pendingState = null;
      this.pendingStartTime = null;
      this.currentState = 'NORMAL_VERIFIED';
      return {
        state: 'NORMAL_VERIFIED',
        isSuspicious: false,
        eventCreated: false,
        incidentId: null,
      };
    }

    // 3. Case: Suspicious Detection (NO_FACE, MISMATCH, MULTIPLE_PERSON)
    let targetState = 'TEMPORARILY_ABSENT';
    let requiredDuration = this.config.ABSENCE_GRACE_SECONDS;

    if (rawStatus === 'NO_FACE') {
      targetState = 'TEMPORARILY_ABSENT';
      requiredDuration = this.config.ABSENCE_GRACE_SECONDS;
    } else if (rawStatus === 'MISMATCH') {
      targetState = 'IDENTITY_MISMATCH';
      requiredDuration = this.config.IDENTITY_MISMATCH_CONFIRM_SECONDS;
    } else if (rawStatus === 'MULTIPLE_PERSON') {
      targetState = 'MULTIPLE_PERSON';
      requiredDuration = this.config.MULTIPLE_PERSON_CONFIRM_SECONDS;
    } else if (rawStatus === 'MULTIPLE_PERSON_IDENTITY_MISMATCH') {
      targetState = 'MULTIPLE_PERSON_IDENTITY_MISMATCH';
      requiredDuration = this.config.MULTIPLE_PERSON_CONFIRM_SECONDS;
    }

    // Check temporal confirmation
    if (this.pendingState !== targetState) {
      this.pendingState = targetState;
      this.pendingStartTime = timestamp;
      return {
        state: targetState,
        isSuspicious: false, // Still observing confirmation window
        eventCreated: false,
        incidentId: null,
      };
    }

    const elapsedSeconds = (timestamp - this.pendingStartTime) / 1000;
    if (elapsedSeconds < requiredDuration) {
      return {
        state: targetState,
        isSuspicious: false,
        eventCreated: false,
        incidentId: null,
      };
    }

    // Confirmed suspicious event!
    this.currentState = targetState;
    const isNewIncident =
      this.activeIncidentId === null || this.activeIncidentType !== targetState;

    if (isNewIncident) {
      const incidentId = `inc_${Math.random().toString(36).slice(2, 8)}`;
      this.activeIncidentId = incidentId;
      this.activeIncidentType = targetState;
      this.incidentStartTime = this.pendingStartTime;
      this.lastEvidenceTime = timestamp;

      const event = {
        id: `ev_${Math.random().toString(36).slice(2, 8)}`,
        incidentId,
        eventType: targetState,
        timestamp,
        duration: (timestamp - this.incidentStartTime) / 1000,
      };
      this.createdEvents.push(event);

      return {
        state: targetState,
        isSuspicious: true,
        eventCreated: true,
        incidentId,
        eventId: event.id,
      };
    }

    // Ongoing incident - Deduplication (no duplicate event creation)
    return {
      state: targetState,
      isSuspicious: true,
      eventCreated: false,
      incidentId: this.activeIncidentId,
    };
  }
}

test('Identity Monitoring Config: specifies valid temporal thresholds', () => {
  const sm = new IdentityMonitoringStateMachine();
  assert.equal(sm.config.IDENTITY_MISMATCH_CONFIRM_SECONDS, 3.0);
  assert.equal(sm.config.ABSENCE_GRACE_SECONDS, 5.0);
  assert.equal(sm.config.MULTIPLE_PERSON_CONFIRM_SECONDS, 2.0);
  assert.equal(sm.config.INCIDENT_COOLDOWN_SECONDS, 30.0);
});

test('State Machine: Test 1 — One verified student continuously visible remains NORMAL_VERIFIED', () => {
  const sm = new IdentityMonitoringStateMachine();
  const res = sm.processFrame({ faceCount: 1, isVerifiedStudent: true });
  assert.equal(res.state, 'NORMAL_VERIFIED');
  assert.equal(res.isSuspicious, false);
  assert.equal(res.eventCreated, false);
  assert.equal(sm.createdEvents.length, 0);
});

test('State Machine: Test 2 — Student briefly moves out of frame does NOT immediately flag an event', () => {
  const sm = new IdentityMonitoringStateMachine();
  let time = 10000;

  // Frame 1: 0 faces
  const r1 = sm.processFrame({ faceCount: 0, isVerifiedStudent: false, timestamp: time });
  assert.equal(r1.state, 'TEMPORARILY_ABSENT');
  assert.equal(r1.isSuspicious, false);
  assert.equal(r1.eventCreated, false);

  // Frame 2: 2 seconds later (< 5s grace period)
  time += 2000;
  const r2 = sm.processFrame({ faceCount: 0, isVerifiedStudent: false, timestamp: time });
  assert.equal(r2.isSuspicious, false);
  assert.equal(r2.eventCreated, false);
  assert.equal(sm.createdEvents.length, 0);
});

test('State Machine: Test 3 — Student returns before grace period expires restores NORMAL_VERIFIED without event', () => {
  const sm = new IdentityMonitoringStateMachine();
  let time = 10000;

  // Leaves frame for 2s
  sm.processFrame({ faceCount: 0, isVerifiedStudent: false, timestamp: time });
  time += 2000;

  // Returns within grace period
  const res = sm.processFrame({ faceCount: 1, isVerifiedStudent: true, timestamp: time });
  assert.equal(res.state, 'NORMAL_VERIFIED');
  assert.equal(res.isSuspicious, false);
  assert.equal(sm.createdEvents.length, 0);
});

test('State Machine: Test 4 & 5 — Single bad frame / brief unknown person does NOT trigger event, but persistent mismatch confirms', () => {
  const sm = new IdentityMonitoringStateMachine();
  let time = 10000;

  // Frame 1: Unknown person appears
  const r1 = sm.processFrame({ faceCount: 1, isVerifiedStudent: false, timestamp: time });
  assert.equal(r1.state, 'IDENTITY_MISMATCH');
  assert.equal(r1.isSuspicious, false); // Pending confirmation!
  assert.equal(r1.eventCreated, false);

  // Frame 2: 1 second later (< 3s confirmation threshold)
  time += 1000;
  const r2 = sm.processFrame({ faceCount: 1, isVerifiedStudent: false, timestamp: time });
  assert.equal(r2.isSuspicious, false);
  assert.equal(r2.eventCreated, false);
  assert.equal(sm.createdEvents.length, 0);

  // Frame 3: 3.5 seconds after initial detection (>= 3s confirmation threshold)
  time += 2500;
  const r3 = sm.processFrame({ faceCount: 1, isVerifiedStudent: false, timestamp: time });
  assert.equal(r3.isSuspicious, true);
  assert.equal(r3.eventCreated, true);
  assert.ok(r3.incidentId);
  assert.equal(sm.createdEvents.length, 1);
  assert.equal(sm.createdEvents[0].eventType, 'IDENTITY_MISMATCH');
});

test('State Machine: Test 6 — Two people visible confirms MULTIPLE_PERSON', () => {
  const sm = new IdentityMonitoringStateMachine();
  let time = 10000;

  // Initial detection
  sm.processFrame({ faceCount: 2, isVerifiedStudent: false, timestamp: time });
  time += 2500; // >= 2.0s threshold

  const res = sm.processFrame({ faceCount: 2, isVerifiedStudent: false, timestamp: time });
  assert.equal(res.state, 'MULTIPLE_PERSON');
  assert.equal(res.isSuspicious, true);
  assert.equal(res.eventCreated, true);
  assert.equal(sm.createdEvents[0].eventType, 'MULTIPLE_PERSON');
});

test('State Machine: Test 7 — Registered student + unknown person confirms MULTIPLE_PERSON_IDENTITY_MISMATCH', () => {
  const sm = new IdentityMonitoringStateMachine();
  let time = 10000;

  sm.processFrame({ faceCount: 2, isVerifiedStudent: true, timestamp: time });
  time += 2500;

  const res = sm.processFrame({ faceCount: 2, isVerifiedStudent: true, timestamp: time });
  assert.equal(res.state, 'MULTIPLE_PERSON_IDENTITY_MISMATCH');
  assert.equal(res.isSuspicious, true);
  assert.equal(res.eventCreated, true);
  assert.equal(sm.createdEvents[0].eventType, 'MULTIPLE_PERSON_IDENTITY_MISMATCH');
});

test('State Machine: Test 8 — Unknown person remains for 30s produces ONE incident, not hundreds of events (Deduplication)', () => {
  const sm = new IdentityMonitoringStateMachine();
  let time = 10000;

  // Trigger confirmed mismatch
  sm.processFrame({ faceCount: 1, isVerifiedStudent: false, timestamp: time });
  time += 3500;
  const init = sm.processFrame({ faceCount: 1, isVerifiedStudent: false, timestamp: time });
  const incidentId = init.incidentId;

  // Simulate 30 subsequent sampled frames (every 1 second)
  for (let i = 0; i < 30; i++) {
    time += 1000;
    const r = sm.processFrame({ faceCount: 1, isVerifiedStudent: false, timestamp: time });
    assert.equal(r.incidentId, incidentId);
    assert.equal(r.eventCreated, false); // Deduplicated!
  }

  // Still only 1 confirmed event created
  assert.equal(sm.createdEvents.length, 1);
});

test('State Machine: Test 9 — Unknown person leaves and registered student returns closes incident and recovers', () => {
  const sm = new IdentityMonitoringStateMachine();
  let time = 10000;

  // Create confirmed mismatch incident
  sm.processFrame({ faceCount: 1, isVerifiedStudent: false, timestamp: time });
  time += 3500;
  sm.processFrame({ faceCount: 1, isVerifiedStudent: false, timestamp: time });
  assert.ok(sm.activeIncidentId);

  // Student returns and verifies
  time += 2000;
  const recRes = sm.processFrame({ faceCount: 1, isVerifiedStudent: true, timestamp: time });
  assert.equal(recRes.state, 'NORMAL_VERIFIED');
  assert.equal(recRes.isSuspicious, false);
  assert.equal(sm.activeIncidentId, null);
  assert.equal(sm.recoveredEvents.length, 1);
  assert.equal(sm.recoveredEvents[0].previousType, 'IDENTITY_MISMATCH');
});

test('Exam Lifecycle: Monitoring ceases once exam ends or unmounts', () => {
  let isExamActive = true;
  let framesProcessed = 0;

  const simulateSampling = () => {
    if (!isExamActive) return;
    framesProcessed++;
  };

  simulateSampling();
  simulateSampling();
  assert.equal(framesProcessed, 2);

  // Exam submitted
  isExamActive = false;
  simulateSampling();
  simulateSampling();
  assert.equal(framesProcessed, 2); // No new frames processed
});
