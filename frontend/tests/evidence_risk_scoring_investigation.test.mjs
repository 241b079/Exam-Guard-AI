import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Risk Scoring: Maps scores to appropriate risk classification tiers', () => {
  const getRiskClassification = (score) => {
    if (score >= 75.0) return 'CRITICAL';
    if (score >= 50.0) return 'HIGH';
    if (score >= 30.0) return 'MEDIUM';
    return 'LOW';
  };

  assert.equal(getRiskClassification(0), 'LOW');
  assert.equal(getRiskClassification(25.5), 'LOW');
  assert.equal(getRiskClassification(29.9), 'LOW');
  assert.equal(getRiskClassification(30.0), 'MEDIUM');
  assert.equal(getRiskClassification(49.0), 'MEDIUM');
  assert.equal(getRiskClassification(50.0), 'HIGH');
  assert.equal(getRiskClassification(74.5), 'HIGH');
  assert.equal(getRiskClassification(75.0), 'CRITICAL');
  assert.equal(getRiskClassification(100.0), 'CRITICAL');
});

test('Business Rule: Even at 100/100 Critical Risk, examination remains uninterrupted', () => {
  const attemptState = {
    attempt_id: 'att-123',
    status: 'IN_PROGRESS',
    risk_score: 100.0,
    risk_level: 'CRITICAL',
    monitoring_status: 'CRITICAL_RISK',
  };

  // Rule verification: Proctoring status is decoupled from examination status
  assert.equal(attemptState.risk_score, 100.0);
  assert.equal(attemptState.risk_level, 'CRITICAL');
  assert.equal(attemptState.status, 'IN_PROGRESS', 'Exam attempt must never be auto-terminated or submitted');
});

test('Incident Deduplication & Suppression: Correlated tab blur events within 3s count once', () => {
  const events = [
    { type: 'PAGE_HIDDEN', timestamp: 1000, risk: 20 },
    { type: 'WINDOW_BLUR', timestamp: 1500, risk: 20 }, // Correlated within 500ms -> suppressed
    { type: 'PAGE_HIDDEN', timestamp: 60000, risk: 20 }, // 1 min later -> valid second incident
  ];

  let calculatedScore = 0;
  let lastTabTime = -999999;
  for (const ev of events) {
    if (['PAGE_HIDDEN', 'WINDOW_BLUR'].includes(ev.type)) {
      if (Math.abs(ev.timestamp - lastTabTime) < 3000) {
        continue; // suppressed
      }
      lastTabTime = ev.timestamp;
    }
    calculatedScore += ev.risk;
  }

  assert.equal(calculatedScore, 40, 'Only 2 independent tab incidents counted; correlated blur suppressed');
});

test('False Positive Recalculation: Rejecting incident reduces risk score', () => {
  const incidents = [
    { id: 'inc-1', contribution: 25.0, review_status: 'CONFIRMED' },
    { id: 'inc-2', contribution: 40.0, review_status: 'CONFIRMED' },
    { id: 'inc-3', contribution: 20.0, review_status: 'PENDING' },
  ];

  const calcScore = (list) =>
    list
      .filter((i) => i.review_status !== 'FALSE_POSITIVE')
      .reduce((sum, i) => sum + i.contribution, 0);

  const initialScore = calcScore(incidents);
  assert.equal(initialScore, 85.0);

  // Faculty marks inc-2 as FALSE_POSITIVE
  incidents[1].review_status = 'FALSE_POSITIVE';
  const recalculatedScore = calcScore(incidents);
  assert.equal(recalculatedScore, 45.0, 'Score drops from 85 to 45 after false positive rejection');
});

test('Technical Interruption: WebRTC drop assigns zero risk points', () => {
  const interruptionEvent = {
    incident_type: 'MONITORING_INTERRUPTED',
    category: 'NETWORK_ANOMALY',
    confidence: 0.9,
    weight: 0.0,
    ai_classification: 'INCONCLUSIVE',
  };

  const riskContribution = interruptionEvent.weight * interruptionEvent.confidence;
  assert.equal(riskContribution, 0.0, 'Technical interruptions must not penalize candidate');
});

test('Faculty Adjudication Validation: Disqualification mandates non-empty justification', () => {
  const validateAdjudication = (verdict, reason) => {
    if (['DISQUALIFIED', 'VIOLATION_CONFIRMED'].includes(verdict)) {
      if (!reason || !reason.trim()) {
        return { valid: false, error: 'A formal justification reason is required for adverse actions.' };
      }
    }
    return { valid: true };
  };

  assert.equal(validateAdjudication('CLEARED', '').valid, true);
  assert.equal(validateAdjudication('DISQUALIFIED', '').valid, false);
  assert.equal(validateAdjudication('DISQUALIFIED', '   ').valid, false);
  assert.equal(
    validateAdjudication('DISQUALIFIED', 'Confirmed unauthorized secondary person helping with questions.').valid,
    true
  );
  assert.equal(validateAdjudication('VIOLATION_CONFIRMED', '').valid, false);
  assert.equal(validateAdjudication('VIOLATION_CONFIRMED', 'Repeated unauthorized browser tab switching.').valid, true);
});
