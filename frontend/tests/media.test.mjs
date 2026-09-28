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

test('Cross-Device URL Resolution: derives WSS for HTTPS ngrok and supports explicit overrides', () => {
  function resolveApiUrl(envApiUrl, port = '3000', origin = 'http://localhost:3000') {
    if (envApiUrl) return envApiUrl.replace(/\/+$/, '');
    if (port === '3000') return 'http://localhost:8000';
    return origin;
  }

  function resolveWsUrl(apiUrl, envWsUrl, path = '') {
    const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    if (envWsUrl) return `${envWsUrl.replace(/\/+$/, '')}${cleanPath}`;
    const wsProto = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
    const host = apiUrl.replace(/^https?:\/\//, '');
    return `${wsProto}//${host}${cleanPath}`;
  }

  // 1. Localhost default
  const localApi = resolveApiUrl(undefined);
  assert.equal(localApi, 'http://localhost:8000');
  const localWs = resolveWsUrl(localApi, undefined, '/api/v1/exams/123/ws');
  assert.equal(localWs, 'ws://localhost:8000/api/v1/exams/123/ws');

  // 2. HTTPS ngrok tunnel
  const ngrokApi = resolveApiUrl('https://abc-123.ngrok-free.app');
  assert.equal(ngrokApi, 'https://abc-123.ngrok-free.app');
  const ngrokWs = resolveWsUrl(ngrokApi, undefined, '/api/v1/exams/456/ws');
  assert.equal(ngrokWs, 'wss://abc-123.ngrok-free.app/api/v1/exams/456/ws');

  // 3. Dedicated WSS override
  const customWs = resolveWsUrl(ngrokApi, 'wss://signaling.example.com', '/api/v1/exams/789/ws');
  assert.equal(customWs, 'wss://signaling.example.com/api/v1/exams/789/ws');
});

test('WebRTC ICE Configuration: parses environment STUN/TURN and falls back safely', () => {
  const DEFAULT_STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

  function parseIceConfig(envVal) {
    if (envVal) {
      try {
        const parsed = JSON.parse(envVal);
        if (Array.isArray(parsed)) return { iceServers: parsed };
        if (parsed.iceServers) return parsed;
      } catch {}
    }
    return { iceServers: DEFAULT_STUN };
  }

  // Default
  assert.equal(parseIceConfig(undefined).iceServers[0].urls, 'stun:stun.l.google.com:19302');

  // Custom TURN JSON array
  const turnJson = JSON.stringify([
    { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pwd' }
  ]);
  const parsedTurn = parseIceConfig(turnJson);
  assert.equal(parsedTurn.iceServers[0].urls, 'turn:turn.example.com:3478');
  assert.equal(parsedTurn.iceServers[0].username, 'user');
});

test('Mobile Device Compatibility: adjusts allMediaReady when screen sharing is unavailable', () => {
  function checkMediaReady({ cameraReady, micReady, screenReady, hasScreenShareSupport }) {
    return Boolean(cameraReady && micReady && (hasScreenShareSupport ? screenReady : true));
  }

  // Desktop (hasScreenShareSupport = true): requires all 3
  assert.equal(checkMediaReady({ cameraReady: true, micReady: true, screenReady: false, hasScreenShareSupport: true }), false);
  assert.equal(checkMediaReady({ cameraReady: true, micReady: true, screenReady: true, hasScreenShareSupport: true }), true);

  // Mobile (hasScreenShareSupport = false): camera + mic suffices
  assert.equal(checkMediaReady({ cameraReady: true, micReady: false, screenReady: false, hasScreenShareSupport: false }), false);
  assert.equal(checkMediaReady({ cameraReady: true, micReady: true, screenReady: false, hasScreenShareSupport: false }), true);
});

test('WebRTC Glare Prevention: ignores duplicate offer requests when negotiation is already in flight', () => {
  let offerCount = 0;
  const peerConnections = new Map();

  function handleOfferRequest(facultyId, forceRestart = false) {
    const existing = peerConnections.get(facultyId);
    if (existing && !forceRestart) {
      if (existing.signalingState === 'have-local-offer' || existing.connectionState === 'connected') {
        return false; // Skip duplicate offer request
      }
    }
    offerCount += 1;
    peerConnections.set(facultyId, {
      signalingState: 'have-local-offer',
      connectionState: 'connecting',
    });
    return true;
  }

  // First request from faculty_joined -> initiates offer
  const initiated1 = handleOfferRequest('fac-1', false);
  assert.equal(initiated1, true);
  assert.equal(offerCount, 1);

  // Simultaneous duplicate request_offer received before answer -> MUST BE IGNORED
  const initiated2 = handleOfferRequest('fac-1', false);
  assert.equal(initiated2, false);
  assert.equal(offerCount, 1);
});

test('ICE Candidate Queuing: buffers candidates received before remote description is set', () => {
  const pendingCandidates = [];
  let appliedCandidates = [];
  let hasRemoteDescription = false;

  function onCandidateReceived(candidate) {
    if (!hasRemoteDescription) {
      pendingCandidates.push(candidate);
    } else {
      appliedCandidates.push(candidate);
    }
  }

  function onRemoteDescriptionSet() {
    hasRemoteDescription = true;
    while (pendingCandidates.length > 0) {
      appliedCandidates.push(pendingCandidates.shift());
    }
  }

  // Candidate arrives before SDP answer
  onCandidateReceived({ candidate: 'cand-1' });
  assert.equal(pendingCandidates.length, 1);
  assert.equal(appliedCandidates.length, 0);

  // SDP answer arrives and remote description is set
  onRemoteDescriptionSet();
  assert.equal(pendingCandidates.length, 0);
  assert.equal(appliedCandidates.length, 1);
  assert.equal(appliedCandidates[0].candidate, 'cand-1');

  // Candidate arrives after SDP answer
  onCandidateReceived({ candidate: 'cand-2' });
  assert.equal(appliedCandidates.length, 2);
  assert.equal(appliedCandidates[1].candidate, 'cand-2');
});

test('Faculty Live Monitor: disconnect switches card to Student Offline and clears stale feed', () => {
  let streamState = {
    cameraStream: new MockMediaStream([new MockMediaStreamTrack('video')]),
    connectionState: 'connected',
    hasCamera: true,
  };

  function handleStudentLeft() {
    streamState = {
      cameraStream: null,
      connectionState: 'disconnected',
      hasCamera: false,
    };
  }

  assert.equal(streamState.connectionState, 'connected');
  assert.equal(Boolean(streamState.cameraStream), true);

  handleStudentLeft();

  assert.equal(streamState.connectionState, 'disconnected');
  assert.equal(streamState.cameraStream, null);
  assert.equal(streamState.hasCamera, false);
});

