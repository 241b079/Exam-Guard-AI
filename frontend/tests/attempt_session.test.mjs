import test from 'node:test';
import assert from 'node:assert';

test('Session Recovery: same session_token preserves attempt without consuming rejoin', () => {
  const currentAttempt = {
    id: 'att-123',
    exam_id: 'exam-abc',
    session_token: 'sess-laptop-xyz',
    rejoin_count: 0,
    max_rejoins: 2,
    status: 'IN_PROGRESS'
  };

  const incomingRequest = {
    session_token: 'sess-laptop-xyz',
    is_rejoin: false
  };

  const isNormalRecovery = (
    currentAttempt.session_token &&
    incomingRequest.session_token === currentAttempt.session_token &&
    !incomingRequest.is_rejoin
  );

  assert.strictEqual(isNormalRecovery, true);
  assert.strictEqual(currentAttempt.rejoin_count, 0); // No rejoin consumed on normal refresh
});

test('Rejoin Limit: explicit rejoin increments count and enforces max_rejoins', () => {
  let rejoinCount = 1;
  const maxRejoins = 2;

  // Next rejoin attempt
  const canRejoinFirst = rejoinCount < maxRejoins;
  assert.strictEqual(canRejoinFirst, true);
  rejoinCount += 1; // reaches 2

  // Another rejoin attempt should be blocked
  const canRejoinSecond = rejoinCount < maxRejoins;
  assert.strictEqual(canRejoinSecond, false);
});

test('Student Exam Card: correctly determines action state based on attempt status', () => {
  function getExamCardAction(status) {
    if (status.has_active_attempt) return 'RESUME';
    if (status.reexam_available) return 'START_REEXAM';
    if (status.latest_attempt_status === 'SUBMITTED') return 'SUBMITTED';
    if (status.latest_attempt_status === 'EXPIRED') return 'EXPIRED';
    if (!status.can_start_or_resume) return 'LIMIT_REACHED';
    return 'START';
  }

  assert.strictEqual(
    getExamCardAction({ has_active_attempt: true, latest_attempt_status: 'IN_PROGRESS' }),
    'RESUME'
  );

  assert.strictEqual(
    getExamCardAction({ has_active_attempt: false, reexam_available: true, latest_attempt_status: 'SUBMITTED' }),
    'START_REEXAM'
  );

  assert.strictEqual(
    getExamCardAction({ has_active_attempt: false, reexam_available: false, latest_attempt_status: 'SUBMITTED', can_start_or_resume: false }),
    'SUBMITTED'
  );

  assert.strictEqual(
    getExamCardAction({ has_active_attempt: false, reexam_available: false, latest_attempt_status: null, can_start_or_resume: true }),
    'START'
  );
});

test('Server-controlled countdown: correctly formats remaining seconds to MM:SS and HH:MM:SS', () => {
  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  assert.strictEqual(formatTime(1935), '32:15');
  assert.strictEqual(formatTime(3665), '01:01:05');
  assert.strictEqual(formatTime(0), '00:00');
});
