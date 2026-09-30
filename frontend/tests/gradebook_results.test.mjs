import test from 'node:test';
import assert from 'node:assert/strict';

test('Gradebook & Results: calculates correct percentage and evaluation status', () => {
  function calculatePercentage(score, maxScore) {
    if (!maxScore || maxScore <= 0) return 0;
    return Math.round(((score || 0) / maxScore) * 100);
  }

  assert.equal(calculatePercentage(9.5, 10.0), 95);
  assert.equal(calculatePercentage(0, 10.0), 0);
  assert.equal(calculatePercentage(5, 15), 33);
  assert.equal(calculatePercentage(10, 0), 0);

  function evaluateAttemptStatus(questions) {
    const shortAnswers = questions.filter(q => q.question_type === 'SHORT_ANSWER');
    if (shortAnswers.length === 0) return 'EVALUATED';
    const allGraded = shortAnswers.every(q => q.marks_awarded !== null && q.marks_awarded !== undefined);
    return allGraded ? 'EVALUATED' : 'NEEDS_GRADING';
  }

  const mcqOnly = [
    { question_type: 'MCQ', marks_awarded: 2.0 },
    { question_type: 'MCQ', marks_awarded: 0.0 }
  ];
  assert.equal(evaluateAttemptStatus(mcqOnly), 'EVALUATED');

  const mixedPending = [
    { question_type: 'MCQ', marks_awarded: 2.0 },
    { question_type: 'SHORT_ANSWER', marks_awarded: null }
  ];
  assert.equal(evaluateAttemptStatus(mixedPending), 'NEEDS_GRADING');

  const mixedGraded = [
    { question_type: 'MCQ', marks_awarded: 2.0 },
    { question_type: 'SHORT_ANSWER', marks_awarded: 4.5 }
  ];
  assert.equal(evaluateAttemptStatus(mixedGraded), 'EVALUATED');
});

test('Manual Grading Validation: rejects negative marks and marks exceeding maximum', () => {
  function validateManualMarks(marks, maxMarks) {
    if (marks === undefined || marks === null || isNaN(marks)) {
      return { valid: false, error: 'Numeric mark required' };
    }
    if (marks < 0) {
      return { valid: false, error: 'Marks cannot be negative' };
    }
    if (marks > maxMarks) {
      return { valid: false, error: `Marks cannot exceed question maximum (${maxMarks})` };
    }
    return { valid: true, error: null };
  }

  assert.equal(validateManualMarks(-1, 5).valid, false);
  assert.equal(validateManualMarks(-0.5, 5).error, 'Marks cannot be negative');
  assert.equal(validateManualMarks(6, 5).valid, false);
  assert.equal(validateManualMarks(5.5, 5).error, 'Marks cannot exceed question maximum (5)');
  assert.equal(validateManualMarks(0, 5).valid, true);
  assert.equal(validateManualMarks(4.5, 5).valid, true);
  assert.equal(validateManualMarks(5.0, 5).valid, true);
});

test('Student Historical Re-entry: validates attempt ownership and parameters', () => {
  function canStudentAccessResult(attemptStudentId, currentUserId) {
    return attemptStudentId === currentUserId;
  }

  assert.equal(canStudentAccessResult('student-123', 'student-123'), true);
  assert.equal(canStudentAccessResult('student-123', 'student-999'), false);
});
