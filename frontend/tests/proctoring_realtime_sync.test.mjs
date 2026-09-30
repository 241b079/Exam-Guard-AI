import test from 'node:test';
import assert from 'node:assert';

test('Violation Deduplication: identical violation ID is recorded once and does not duplicate in state', () => {
  const initialMonitoring = [
    {
      attempt_id: 'att-001',
      student: { id: 'stu-001', name: 'Alice', email: 'alice@univ.edu' },
      violation_count: 1,
      recent_violations: [
        {
          id: 'v-100',
          exam_attempt_id: 'att-001',
          student_id: 'stu-001',
          violation_type: 'TAB_SWITCH',
          timestamp: '2026-09-30T10:00:00Z',
        },
      ],
    },
  ];

  // Incoming duplicate event with same ID
  const duplicateViolation = {
    id: 'v-100',
    exam_attempt_id: 'att-001',
    student_id: 'stu-001',
    violation_type: 'TAB_SWITCH',
    timestamp: '2026-09-30T10:00:00Z',
  };

  const updateState = (prev, violation) => {
    return prev.map((item) => {
      const match =
        item.attempt_id === violation.exam_attempt_id ||
        item.student.id === violation.student_id;
      if (match) {
        const exists = (item.recent_violations || []).some((v) => v.id === violation.id);
        if (exists) return item;
        return {
          ...item,
          violation_count: item.violation_count + 1,
          recent_violations: [violation, ...(item.recent_violations || [])].slice(0, 10),
        };
      }
      return item;
    });
  };

  const nextMonitoring = updateState(initialMonitoring, duplicateViolation);
  assert.strictEqual(nextMonitoring[0].violation_count, 1);
  assert.strictEqual(nextMonitoring[0].recent_violations.length, 1);
  assert.strictEqual(nextMonitoring[0].recent_violations[0].id, 'v-100');

  // Incoming new event
  const newViolation = {
    id: 'v-101',
    exam_attempt_id: 'att-001',
    student_id: 'stu-001',
    violation_type: 'MULTIPLE_FACES',
    timestamp: '2026-09-30T10:01:00Z',
  };

  const updatedMonitoring = updateState(nextMonitoring, newViolation);
  assert.strictEqual(updatedMonitoring[0].violation_count, 2);
  assert.strictEqual(updatedMonitoring[0].recent_violations.length, 2);
  assert.strictEqual(updatedMonitoring[0].recent_violations[0].id, 'v-101');
  assert.strictEqual(updatedMonitoring[0].recent_violations[1].id, 'v-100');
});

test('Rejoin State Synchronization: faculty receives authoritative rejoin count and connection updates', () => {
  const monitoringData = [
    {
      attempt_id: 'att-002',
      student: { id: 'stu-002', name: 'Bob', email: 'bob@univ.edu' },
      rejoin_count: 0,
      max_rejoins: 2,
      status: 'IN_PROGRESS',
    },
  ];

  const handleStudentRejoined = (prev, payload) => {
    return prev.map((item) => {
      const match =
        item.attempt_id === payload.attempt_id ||
        item.student.id === payload.student_id;
      if (match) {
        return {
          ...item,
          rejoin_count: payload.rejoin_count ?? item.rejoin_count + 1,
          max_rejoins: payload.max_rejoins ?? item.max_rejoins,
          status: payload.status || item.status,
        };
      }
      return item;
    });
  };

  const updated = handleStudentRejoined(monitoringData, {
    attempt_id: 'att-002',
    student_id: 'stu-002',
    rejoin_count: 1,
    max_rejoins: 2,
    status: 'IN_PROGRESS',
  });

  assert.strictEqual(updated[0].rejoin_count, 1);
  assert.strictEqual(updated[0].max_rejoins, 2);

  // Second rejoin
  const updatedSecond = handleStudentRejoined(updated, {
    attempt_id: 'att-002',
    student_id: 'stu-002',
    rejoin_count: 2,
    max_rejoins: 2,
    status: 'IN_PROGRESS',
  });

  assert.strictEqual(updatedSecond[0].rejoin_count, 2);
});

test('Camera Preview Mount Lifecycle: attaches stream upon video node mounting', () => {
  let attachedSrcObject = null;
  let played = false;

  const mockVideo = {
    srcObject: null,
    muted: false,
    defaultMuted: false,
    playsInline: false,
    play: async () => {
      played = true;
    },
  };

  const mockStream = { id: 'cam-stream-999', active: true };

  // Callback ref simulation
  const setLocalVideoRef = (node, stream) => {
    if (!node || !stream || !stream.active) return;
    if (node.srcObject !== stream) {
      node.srcObject = stream;
    }
    node.muted = true;
    node.defaultMuted = true;
    node.playsInline = true;
    node.play();
  };

  setLocalVideoRef(mockVideo, mockStream);

  assert.strictEqual(mockVideo.srcObject.id, 'cam-stream-999');
  assert.strictEqual(mockVideo.muted, true);
  assert.strictEqual(mockVideo.playsInline, true);
  assert.strictEqual(played, true);
});
