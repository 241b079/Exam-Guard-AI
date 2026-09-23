import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface StudentMediaTracks {
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  audioStream: MediaStream | null;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
  hasCamera: boolean;
  hasMic: boolean;
  hasScreen: boolean;
}

export interface UseWebRTCFacultyOptions {
  examId: string;
}

export function useWebRTCFaculty({ examId }: UseWebRTCFacultyOptions) {
  const [studentStreams, setStudentStreams] = useState<Record<string, StudentMediaTracks>>({});
  const [activeStudentIds, setActiveStudentIds] = useState<string[]>([]);
  const [isWsConnected, setIsWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const streamMapRef = useRef<Map<string, Record<string, string | null>>>(new Map());
  const streamsStoreRef = useRef<Record<string, StudentMediaTracks>>({});
  const isMountedRef = useRef(true);

  const getWsUrl = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wsProto = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
    const host = apiUrl.replace(/^https?:\/\//, '');
    return `${wsProto}//${host}/api/v1/exams/${examId}/ws?token=${token || ''}`;
  }, [examId]);

  const updateStudentState = useCallback((studentId: string, updater: (prev: StudentMediaTracks) => StudentMediaTracks) => {
    setStudentStreams((prev) => {
      const current = prev[studentId] || {
        cameraStream: null,
        screenStream: null,
        audioStream: null,
        connectionState: 'connecting',
        hasCamera: false,
        hasMic: false,
        hasScreen: false,
      };
      const updated = updater(current);
      streamsStoreRef.current[studentId] = updated;
      return {
        ...prev,
        [studentId]: updated,
      };
    });
  }, []);

  /**
   * Request an offer from a specific student (or all active students)
   */
  const requestOfferFromStudent = useCallback((targetClientId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'request_offer',
          target_client_id: targetClientId,
        })
      );
    }
  }, []);

  /**
   * Handle WebRTC SDP Offer from a student
   */
  const handleStudentOffer = useCallback(
    async (studentClientId: string, studentId: string, sdp: string, streamMap: Record<string, string | null>) => {
      if (typeof window === 'undefined' || !window.RTCPeerConnection) return;

      // Store student track mapping metadata
      streamMapRef.current.set(studentId, streamMap || {});

      // Close previous connection if any
      const existing = peerConnectionsRef.current.get(studentId);
      if (existing) {
        existing.close();
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current.set(studentId, pc);

      // Prepare streams containers
      const camStream = new MediaStream();
      const scrStream = new MediaStream();
      const audStream = new MediaStream();

      pc.ontrack = (event) => {
        const track = event.track;
        const mapping = streamMapRef.current.get(studentId) || {};

        if (track.kind === 'audio') {
          audStream.addTrack(track);
          // Also attach audio to camera stream for convenient preview
          camStream.addTrack(track);
          updateStudentState(studentId, (prev) => ({
            ...prev,
            audioStream: audStream,
            hasMic: track.readyState === 'live',
          }));

          track.onended = () => {
            updateStudentState(studentId, (prev) => ({
              ...prev,
              hasMic: false,
            }));
          };
        } else if (track.kind === 'video') {
          // Check if this video track is the screen share track
          if (mapping.screenTrackId && track.id === mapping.screenTrackId) {
            scrStream.addTrack(track);
            updateStudentState(studentId, (prev) => ({
              ...prev,
              screenStream: scrStream,
              hasScreen: track.readyState === 'live',
            }));

            track.onended = () => {
              updateStudentState(studentId, (prev) => ({
                ...prev,
                hasScreen: false,
              }));
            };
          } else {
            // Camera track
            camStream.addTrack(track);
            updateStudentState(studentId, (prev) => ({
              ...prev,
              cameraStream: camStream,
              hasCamera: track.readyState === 'live',
            }));

            track.onended = () => {
              updateStudentState(studentId, (prev) => ({
                ...prev,
                hasCamera: false,
              }));
            };
          }
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'ice_candidate',
              target_client_id: studentClientId,
              candidate: event.candidate.toJSON(),
            })
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (!isMountedRef.current) return;
        const state = pc.connectionState;
        if (state === 'connected') {
          updateStudentState(studentId, (prev) => ({ ...prev, connectionState: 'connected' }));
        } else if (state === 'connecting') {
          updateStudentState(studentId, (prev) => ({ ...prev, connectionState: 'connecting' }));
        } else if (state === 'disconnected') {
          updateStudentState(studentId, (prev) => ({ ...prev, connectionState: 'disconnected' }));
        } else if (state === 'failed') {
          updateStudentState(studentId, (prev) => ({ ...prev, connectionState: 'failed' }));
        }
      };

      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription({
            type: 'offer',
            sdp,
          })
        );

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'answer',
              target_client_id: studentClientId,
              sdp: answer.sdp,
            })
          );
        }
      } catch (err) {
        console.error(`Failed to negotiate WebRTC with student ${studentId}:`, err);
      }
    },
    [updateStudentState]
  );

  /**
   * Handle incoming WebSocket messages
   */
  const handleSignalingMessage = useCallback(
    async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'connected':
            setIsWsConnected(true);
            if (Array.isArray(msg.active_students)) {
              setActiveStudentIds(msg.active_students.map((s: any) => s.student_id));
              // Request offers from all already-connected students
              msg.active_students.forEach((s: any) => {
                requestOfferFromStudent(s.client_id);
              });
            }
            break;

          case 'student_joined':
            if (msg.student_id) {
              setActiveStudentIds((prev) => Array.from(new Set([...prev, msg.student_id])));
              if (msg.client_id) {
                requestOfferFromStudent(msg.client_id);
              }
            }
            break;

          case 'offer':
            if (msg.sender_client_id && msg.student_id && msg.sdp) {
              await handleStudentOffer(msg.sender_client_id, msg.student_id, msg.sdp, msg.stream_map);
            }
            break;

          case 'ice_candidate': {
            const pc = peerConnectionsRef.current.get(msg.student_id);
            if (pc && msg.candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {
                console.warn('Could not add ICE candidate on faculty:', e);
              }
            }
            break;
          }

          case 'student_left':
            if (msg.student_id) {
              setActiveStudentIds((prev) => prev.filter((id) => id !== msg.student_id));
              const pc = peerConnectionsRef.current.get(msg.student_id);
              if (pc) {
                pc.close();
                peerConnectionsRef.current.delete(msg.student_id);
              }
              setStudentStreams((prev) => {
                const next = { ...prev };
                delete next[msg.student_id];
                return next;
              });
            }
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Faculty signaling message error:', err);
      }
    },
    [handleStudentOffer, requestOfferFromStudent]
  );

  /**
   * Connect to WebSocket
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
        setIsWsConnected(true);
      };

      ws.onmessage = handleSignalingMessage;

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsWsConnected(false);
      };
    } catch (err) {
      console.error('Failed to establish faculty WebSocket connection:', err);
    }
  }, [examId, getWsUrl, handleSignalingMessage]);

  useEffect(() => {
    isMountedRef.current = true;
    connectSignaling();

    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
    };
  }, [connectSignaling]);

  return {
    studentStreams,
    activeStudentIds,
    isWsConnected,
    refresh: connectSignaling,
  };
}
