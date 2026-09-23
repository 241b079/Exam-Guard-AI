import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export type WebRTCConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export interface UseWebRTCStudentOptions {
  examId: string;
  attemptId: string;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  onConnectionLost?: () => void;
  onConnectionFailed?: () => void;
}

export function useWebRTCStudent({
  examId,
  attemptId,
  cameraStream,
  screenStream,
  onConnectionLost,
  onConnectionFailed,
}: UseWebRTCStudentOptions) {
  const [connectionState, setConnectionState] = useState<WebRTCConnectionState>('idle');
  const [facultyConnected, setFacultyConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const getWsUrl = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wsProto = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
    const host = apiUrl.replace(/^https?:\/\//, '');
    return `${wsProto}//${host}/api/v1/exams/${examId}/ws?token=${token || ''}`;
  }, [examId]);

  /**
   * Helper to attach all local media tracks to a peer connection
   */
  const attachTracksToPeer = useCallback(
    (pc: RTCPeerConnection) => {
      const senders = pc.getSenders();
      const sendersMap = new Set(senders.map((s) => s.track?.id).filter(Boolean));

      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => {
          if (!sendersMap.has(track.id)) {
            pc.addTrack(track, cameraStream);
          }
        });
      }

      if (screenStream) {
        screenStream.getTracks().forEach((track) => {
          if (!sendersMap.has(track.id)) {
            pc.addTrack(track, screenStream);
          }
        });
      }
    },
    [cameraStream, screenStream]
  );

  /**
   * Build stream map so faculty can distinguish camera, mic, and screen tracks
   */
  const getStreamMap = useCallback(() => {
    const cameraVideoTrack = cameraStream?.getVideoTracks()[0];
    const cameraAudioTrack = cameraStream?.getAudioTracks()[0];
    const screenVideoTrack = screenStream?.getVideoTracks()[0];

    return {
      cameraTrackId: cameraVideoTrack?.id || null,
      micTrackId: cameraAudioTrack?.id || null,
      screenTrackId: screenVideoTrack?.id || null,
    };
  }, [cameraStream, screenStream]);

  /**
   * Initiate WebRTC offer to an authorized faculty client
   */
  const createOfferForFaculty = useCallback(
    async (facultyClientId: string) => {
      if (typeof window === 'undefined' || !window.RTCPeerConnection) return;

      // Close existing pc for this client if any
      const existing = peerConnectionsRef.current.get(facultyClientId);
      if (existing) {
        existing.close();
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current.set(facultyClientId, pc);

      attachTracksToPeer(pc);

      // ICE candidate handler
      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'ice_candidate',
              target_client_id: facultyClientId,
              candidate: event.candidate.toJSON(),
            })
          );
        }
      };

      // Track connection state
      pc.onconnectionstatechange = () => {
        if (!isMountedRef.current) return;
        const state = pc.connectionState;

        if (state === 'connected') {
          setConnectionState('connected');
          setFacultyConnected(true);
          reconnectAttemptsRef.current = 0;
        } else if (state === 'connecting') {
          setConnectionState('connecting');
        } else if (state === 'disconnected') {
          setConnectionState('disconnected');
          if (onConnectionLost) onConnectionLost();
        } else if (state === 'failed') {
          setConnectionState('failed');
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current += 1;
            setConnectionState('reconnecting');
            // Try renegotiation
            setTimeout(() => {
              if (isMountedRef.current) createOfferForFaculty(facultyClientId);
            }, 2000 * reconnectAttemptsRef.current);
          } else {
            if (onConnectionFailed) onConnectionFailed();
          }
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'offer',
              target_client_id: facultyClientId,
              sdp: offer.sdp,
              stream_map: getStreamMap(),
            })
          );
        }
      } catch (err) {
        console.error('Failed to create WebRTC offer for faculty:', err);
      }
    },
    [attachTracksToPeer, getStreamMap, onConnectionLost, onConnectionFailed]
  );

  /**
   * Handle incoming WebSocket messages from signaling server
   */
  const handleSignalingMessage = useCallback(
    async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'connected':
            setConnectionState('connecting');
            break;

          case 'faculty_joined':
            // Faculty is present and waiting for student stream
            if (msg.faculty_client_id) {
              await createOfferForFaculty(msg.faculty_client_id);
            }
            break;

          case 'request_offer':
            if (msg.sender_client_id) {
              await createOfferForFaculty(msg.sender_client_id);
            }
            break;

          case 'answer': {
            const pc = peerConnectionsRef.current.get(msg.sender_client_id);
            if (pc && msg.sdp) {
              await pc.setRemoteDescription(
                new RTCSessionDescription({
                  type: 'answer',
                  sdp: msg.sdp,
                })
              );
            }
            break;
          }

          case 'ice_candidate': {
            const pc = peerConnectionsRef.current.get(msg.sender_client_id);
            if (pc && msg.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {
                console.warn('Could not add remote ICE candidate:', e);
              }
            }
            break;
          }

          case 'faculty_left':
            if (msg.faculty_client_id) {
              const pc = peerConnectionsRef.current.get(msg.faculty_client_id);
              if (pc) {
                pc.close();
                peerConnectionsRef.current.delete(msg.faculty_client_id);
              }
              if (peerConnectionsRef.current.size === 0) {
                setFacultyConnected(false);
              }
            }
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Error handling signaling message:', err);
      }
    },
    [createOfferForFaculty]
  );

  /**
   * Connect / Reconnect to WebSocket signaling
   */
  const connectSignaling = useCallback(() => {
    if (typeof window === 'undefined' || !examId) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const url = getWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setConnectionState('connecting');
      };

      ws.onmessage = handleSignalingMessage;

      ws.onerror = (err) => {
        console.warn('Signaling WebSocket encountered error:', err);
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        // If not deliberately closed, attempt reconnection
        if (reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current += 1;
          setConnectionState('reconnecting');
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) connectSignaling();
          }, 3000);
        } else {
          setConnectionState('disconnected');
        }
      };
    } catch (err) {
      console.error('Failed to establish WebSocket connection:', err);
    }
  }, [examId, getWsUrl, handleSignalingMessage]);

  // Update active tracks if cameraStream or screenStream changes
  useEffect(() => {
    peerConnectionsRef.current.forEach((pc) => {
      attachTracksToPeer(pc);
    });
  }, [cameraStream, screenStream, attachTracksToPeer]);

  // Establish signaling connection
  useEffect(() => {
    isMountedRef.current = true;
    connectSignaling();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
    };
  }, [connectSignaling]);

  return {
    connectionState,
    facultyConnected,
    reconnect: connectSignaling,
  };
}
