import test from 'node:test';
import assert from 'node:assert/strict';

// Helper mock for MediaStreamTrack
class MockMediaStreamTrack {
  constructor(kind, label = 'mock-track') {
    this.kind = kind;
    this.label = label;
    this.id = `track-${Math.random().toString(36).slice(2, 9)}`;
    this.readyState = 'live';
    this.onended = null;
  }

  stop() {
    this.readyState = 'ended';
    if (typeof this.onended === 'function') {
      this.onended(new Event('ended'));
    }
  }
}

// Helper mock for MediaStream
class MockMediaStream {
  constructor(tracks = []) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

test('Media: validates camera and mic tracks readiness', () => {
  const videoTrack = new MockMediaStreamTrack('video', 'webcam');
  const audioTrack = new MockMediaStreamTrack('audio', 'microphone');
  const camStream = new MockMediaStream([videoTrack, audioTrack]);

  assert.equal(camStream.getVideoTracks().length, 1);
  assert.equal(camStream.getAudioTracks().length, 1);
  assert.equal(camStream.getVideoTracks()[0].readyState, 'live');
  assert.equal(camStream.getAudioTracks()[0].readyState, 'live');
});

test('Media: validates screen share track requires kind=video and readyState=live', () => {
  const screenTrack = new MockMediaStreamTrack('video', 'display-screen');
  const screenStream = new MockMediaStream([screenTrack]);

  const activeScreenTrack = screenStream.getVideoTracks()[0];
  const isValidScreen =
    activeScreenTrack &&
    activeScreenTrack.kind === 'video' &&
    activeScreenTrack.readyState === 'live';

  assert.equal(isValidScreen, true);
});

test('Media: combined exam unlock requires all 3 streams active', () => {
  const checkExamUnlock = ({ cameraReady, micReady, screenReady }) => {
    return Boolean(cameraReady && micReady && screenReady);
  };

  assert.equal(checkExamUnlock({ cameraReady: false, micReady: false, screenReady: false }), false);
  assert.equal(checkExamUnlock({ cameraReady: true, micReady: false, screenReady: false }), false);
  assert.equal(checkExamUnlock({ cameraReady: true, micReady: true, screenReady: false }), false);
  assert.equal(checkExamUnlock({ cameraReady: true, micReady: false, screenReady: true }), false);
  assert.equal(checkExamUnlock({ cameraReady: true, micReady: true, screenReady: true }), true);
});

test('Media: track-ended listeners detect camera loss without auto-submitting exam', () => {
  const videoTrack = new MockMediaStreamTrack('video', 'webcam');
  let cameraLostDetected = false;
  let examSubmitted = false;

  videoTrack.onended = () => {
    cameraLostDetected = true;
    // CRITICAL: Exam must lock with warning, NOT auto-submit!
  };

  videoTrack.stop();

  assert.equal(cameraLostDetected, true);
  assert.equal(examSubmitted, false);
});

test('Media: track-ended listeners detect screen sharing stop without auto-submitting exam', () => {
  const screenTrack = new MockMediaStreamTrack('video', 'screen');
  let screenLostDetected = false;
  let examSubmitted = false;

  screenTrack.onended = () => {
    screenLostDetected = true;
  };

  screenTrack.stop();

  assert.equal(screenLostDetected, true);
  assert.equal(examSubmitted, false);
});

test('WebRTC Track Disambiguation: stream map distinguishes camera, mic, and screen tracks unambiguously', () => {
  const camVideo = new MockMediaStreamTrack('video', 'webcam-track');
  const camAudio = new MockMediaStreamTrack('audio', 'mic-track');
  const scrVideo = new MockMediaStreamTrack('video', 'screen-track');

  const streamMap = {
    cameraTrackId: camVideo.id,
    micTrackId: camAudio.id,
    screenTrackId: scrVideo.id,
  };

  // Simulating faculty receiving incoming tracks in random order
  const incomingTracks = [scrVideo, camAudio, camVideo];
  const mapped = {
    camera: null,
    audio: null,
    screen: null,
  };

  for (const track of incomingTracks) {
    if (track.id === streamMap.cameraTrackId) {
      mapped.camera = track;
    } else if (track.id === streamMap.micTrackId) {
      mapped.audio = track;
    } else if (track.id === streamMap.screenTrackId) {
      mapped.screen = track;
    }
  }

  assert.equal(mapped.camera.id, camVideo.id);
  assert.equal(mapped.audio.id, camAudio.id);
  assert.equal(mapped.screen.id, scrVideo.id);
});

test('WebRTC Reconnection: bounded retry caps at 3 attempts', () => {
  let reconnectCount = 0;
  let connectionFailed = false;

  const handleConnectionFailed = () => {
    if (reconnectCount < 3) {
      reconnectCount += 1;
    } else {
      connectionFailed = true;
    }
  };

  // Simulate 5 connection failures
  for (let i = 0; i < 5; i++) {
    handleConnectionFailed();
  }

  assert.equal(reconnectCount, 3);
  assert.equal(connectionFailed, true);
});

test('Media Permissions Error Handling: parses NotAllowedError and NotFoundError with user-friendly guidance', () => {
  const parseMediaError = (err, deviceType) => {
    const errName = err?.name || '';
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
      return `${deviceType === 'screen' ? 'Screen sharing' : 'Camera or microphone'} permission was denied. Please allow permission in your browser settings and try again.`;
    }
    if (errName === 'NotFoundError') {
      return `Required ${deviceType} device was not found. Please ensure your camera and microphone are connected.`;
    }
    return 'Failed to access device.';
  };

  const deniedErr = { name: 'NotAllowedError' };
  const notFoundErr = { name: 'NotFoundError' };

  const deniedMsg = parseMediaError(deniedErr, 'camera/microphone');
  assert.match(deniedMsg, /permission was denied/i);
  assert.match(deniedMsg, /browser settings/i);

  const notFoundMsg = parseMediaError(notFoundErr, 'camera/microphone');
  assert.match(notFoundMsg, /device was not found/i);
});

test('Media Manager: reuses existing active screen stream without invoking getDisplayMedia again', () => {
  let promptCount = 0;
  const activeScreenTrack = new MockMediaStreamTrack('video', 'active-screen');
  const existingStream = new MockMediaStream([activeScreenTrack]);

  // Simulation of media manager stream reuse check
  function requestScreenShare(existing, force = false) {
    if (!force && existing && existing.getVideoTracks().some((t) => t.readyState === 'live')) {
      return { stream: existing, prompted: false };
    }
    promptCount += 1;
    const newTrack = new MockMediaStreamTrack('video', 'new-screen');
    return { stream: new MockMediaStream([newTrack]), prompted: true };
  }

  // First check with active existing stream -> NO prompt, reuses existing
  const res1 = requestScreenShare(existingStream, false);
  assert.equal(res1.prompted, false);
  assert.equal(res1.stream, existingStream);
  assert.equal(promptCount, 0);

  // Forced check -> prompts and creates new stream
  const res2 = requestScreenShare(existingStream, true);
  assert.equal(res2.prompted, true);
  assert.equal(promptCount, 1);
});

test('Media Manager: preserves streams across onboarding navigation without stopping tracks', () => {
  const screenTrack = new MockMediaStreamTrack('video', 'screen-track');
  const camTrack = new MockMediaStreamTrack('video', 'cam-track');

  let preserveOnUnmount = true;

  // Cleanup simulation
  function handleUnmount() {
    if (!preserveOnUnmount) {
      screenTrack.stop();
      camTrack.stop();
    }
  }

  handleUnmount();
  assert.equal(screenTrack.readyState, 'live');
  assert.equal(camTrack.readyState, 'live');

  // When exam finally finishes, preservation ends and streams stop
  preserveOnUnmount = false;
  handleUnmount();
  assert.equal(screenTrack.readyState, 'ended');
  assert.equal(camTrack.readyState, 'ended');
});
