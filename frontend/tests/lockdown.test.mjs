import test from 'node:test';
import assert from 'node:assert/strict';

// Helper simulation of the lockdown deduplication algorithm
function createViolationDeduplicator() {
  const lastViolationMap = new Map();

  return function shouldRecord(type, timestamp = Date.now()) {
    const lastSameType = lastViolationMap.get(type) || 0;

    // 1. Same-event debounce (2000ms)
    if (timestamp - lastSameType < 2000) {
      return false;
    }

    // 2. Cross-event deduplication:
    // Tab switch triggers both visibilitychange (hidden) and blur within milliseconds
    if (type === 'WINDOW_BLUR') {
      const lastHidden = lastViolationMap.get('PAGE_HIDDEN') || 0;
      if (timestamp - lastHidden < 1200) {
        return false;
      }
    }
    if (type === 'PAGE_HIDDEN') {
      const lastBlur = lastViolationMap.get('WINDOW_BLUR') || 0;
      if (timestamp - lastBlur < 1200) {
        return false;
      }
    }

    lastViolationMap.set(type, timestamp);
    return true;
  };
}

// Helper simulation of the keyboard shortcut filter
function checkRestrictedKey(event) {
  const isCtrlOrCmd = Boolean(event.ctrlKey || event.metaKey);
  const key = event.key?.toLowerCase() || '';

  if (isCtrlOrCmd) {
    if (key === 'c') return { blocked: true, violation: 'COPY_ATTEMPT' };
    if (key === 'v') return { blocked: true, violation: 'PASTE_ATTEMPT' };
    if (key === 'x') return { blocked: true, violation: 'CUT_ATTEMPT' };
    if (key === 'p' || key === 's' || key === 'u') return { blocked: true, violation: null };
  }

  if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    return { blocked: true, violation: null };
  }

  return { blocked: false, violation: null };
}

test('Lockdown: allows initial FULLSCREEN_EXIT violation and debounces rapid consecutive ones', () => {
  const shouldRecord = createViolationDeduplicator();
  const t0 = 10000;

  assert.equal(shouldRecord('FULLSCREEN_EXIT', t0), true);
  // Rapid burst 500ms later -> suppressed
  assert.equal(shouldRecord('FULLSCREEN_EXIT', t0 + 500), false);
  // Burst 1500ms later -> still suppressed (<2000ms)
  assert.equal(shouldRecord('FULLSCREEN_EXIT', t0 + 1500), false);
  // Legitimate recurring violation after 2500ms -> allowed
  assert.equal(shouldRecord('FULLSCREEN_EXIT', t0 + 2500), true);
});

test('Lockdown: cross-deduplicates PAGE_HIDDEN and WINDOW_BLUR during tab switch', () => {
  const shouldRecord = createViolationDeduplicator();
  const t0 = 20000;

  // Student switches tab: visibilitychange fires PAGE_HIDDEN first
  assert.equal(shouldRecord('PAGE_HIDDEN', t0), true);
  // Window immediately blurs 150ms later -> suppressed to prevent duplicate violation for same user action
  assert.equal(shouldRecord('WINDOW_BLUR', t0 + 150), false);

  // After 1500ms, distinct window blur -> allowed
  assert.equal(shouldRecord('WINDOW_BLUR', t0 + 2000), true);
});

test('Lockdown: keyboard restrictions block Ctrl+C, Cmd+C, Ctrl+V, Cmd+V, Ctrl+X, Cmd+X', () => {
  // Ctrl+C
  assert.deepEqual(checkRestrictedKey({ ctrlKey: true, key: 'c' }), { blocked: true, violation: 'COPY_ATTEMPT' });
  // Cmd+C (Mac)
  assert.deepEqual(checkRestrictedKey({ metaKey: true, key: 'c' }), { blocked: true, violation: 'COPY_ATTEMPT' });
  // Ctrl+V
  assert.deepEqual(checkRestrictedKey({ ctrlKey: true, key: 'v' }), { blocked: true, violation: 'PASTE_ATTEMPT' });
  // Cmd+V (Mac)
  assert.deepEqual(checkRestrictedKey({ metaKey: true, key: 'v' }), { blocked: true, violation: 'PASTE_ATTEMPT' });
  // Ctrl+X
  assert.deepEqual(checkRestrictedKey({ ctrlKey: true, key: 'x' }), { blocked: true, violation: 'CUT_ATTEMPT' });
  // Cmd+X (Mac)
  assert.deepEqual(checkRestrictedKey({ metaKey: true, key: 'x' }), { blocked: true, violation: 'CUT_ATTEMPT' });
  // Alt+Left (Browser navigation)
  assert.deepEqual(checkRestrictedKey({ altKey: true, key: 'ArrowLeft' }), { blocked: true, violation: null });
});

test('Lockdown: keyboard restrictions preserve normal typing and accessibility keys', () => {
  // Alphanumeric keys
  assert.deepEqual(checkRestrictedKey({ key: 'a' }), { blocked: false, violation: null });
  assert.deepEqual(checkRestrictedKey({ key: 'B' }), { blocked: false, violation: null });
  assert.deepEqual(checkRestrictedKey({ key: '1' }), { blocked: false, violation: null });
  // Editing keys
  assert.deepEqual(checkRestrictedKey({ key: 'Backspace' }), { blocked: false, violation: null });
  assert.deepEqual(checkRestrictedKey({ key: 'Delete' }), { blocked: false, violation: null });
  assert.deepEqual(checkRestrictedKey({ key: 'Enter' }), { blocked: false, violation: null });
  assert.deepEqual(checkRestrictedKey({ key: 'Tab' }), { blocked: false, violation: null });
  // Navigation
  assert.deepEqual(checkRestrictedKey({ key: 'ArrowDown' }), { blocked: false, violation: null });
  assert.deepEqual(checkRestrictedKey({ key: 'ArrowUp' }), { blocked: false, violation: null });
});
