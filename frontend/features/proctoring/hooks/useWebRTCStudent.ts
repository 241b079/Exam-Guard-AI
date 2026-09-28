'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { getWsUrl } from '@/lib/api';
import { getIceConfiguration } from '../config/webrtc';

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
  onSignalingLost?: () => void;
}

export function useWebRTCStudent({
  examId,
  attemptId,
  cameraStream,
  screenStream,
  onConnectionLost,
  onConnectionFailed,
  onSignalingLost,
}: UseWebRTCStudentOptions) {
  const [connectionState, setConnectionState] = useState<WebRTCConnectionState>('idle');
  const [facultyConnected, setFacultyConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const inFlightOffersRef = useRef<Set<string>>(new Set());
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Keep references to media streams and callbacks stable
  const cameraStreamRef = useRef<MediaStream | null>(cameraStream);
  const screenStreamRef = useRef<MediaStream | null>(screenStream);
  const onConnectionLostRef = useRef(onConnectionLost);
  const onConnectionFailedRef = useRef(onConnectionFailed);
  const onSignalingLostRef = useRef(onSignalingLost);

  useEffect(() => {
    cameraStreamRef.current = cameraStream;
    screenStreamRef.current = screenStream;
    onConnectionLostRef.current = onConnectionLost;
    onConnectionFailedRef.current = onConnectionFailed;
    onSignalingLostRef.current = onSignalingLost;
  }, [cameraStream, screenStream, onConnectionLost, onConnectionFailed, onSignalingLost]);

  const getSignalingWsUrl = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const attemptQuery = attemptId ? `&attempt_id=${encodeURIComponent(attemptId)}` : '';
    return getWsUrl(`/api/v1/exams/${examId}/ws?token=${token || ''}${attemptQuery}`);
  }, [examId, attemptId]);

  /**
   * Attach/sync tracks to an RTCPeerConnection
   */
  const syncTracksToPeer = useCallback((pc: RTCPeerConnection) => {
    const senders = pc.getSenders();
    const currentCam = cameraStreamRef.current;
    const currentScr = screenStreamRef.current;

    // Attach camera video and audio
    if (currentCam) {
      currentCam.getTracks().forEach((track) => {
        const existingSender = senders.find(
          (s) => s.track?.kind === track.kind && s.track?.id === track.id
        );
        if (!existingSender) {
          const kindSender = senders.find((s) => s.track && s.track.kind === track.kind);
          if (kindSender && kindSender.track?.id !== track.id) {
            kindSender.replaceTrack(track).catch(() => {});
          } else if (!kindSender) {
            try {
              pc.addTrack(track, currentCam);
            } catch {}
          }
        }
      });
    }

    // Attach screen share video
    if (currentScr) {
      currentScr.getVideoTracks().forEach((track) => {
        const existingSender = senders.find((s) => s.track?.id === track.id);
        if (!existingSender) {
          try {
            pc.addTrack(track, currentScr);
          } catch {}
        }
      });
    }
  }, []);

  /**
   * Disambiguation map for faculty monitor
   */
  const getStreamMap = useCallback(() => {
    const currentCam = cameraStreamRef.current;
    const currentScr = screenStreamRef.current;
    const cameraVideoTrack = currentCam?.getVideoTracks()[0];
    const cameraAudioTrack = currentCam?.getAudioTracks()[0];
    const screenVideoTrack = currentScr?.getVideoTracks()[0];

    return {
      cameraTrackId: cameraVideoTrack?.id || null,
      micTrackId: cameraAudioTrack?.id || null,
      screenTrackId: screenVideoTrack?.id || null,
    };
  }, []);

  /**
   * Helper to send current media state over WebSocket
   */
  const sendMediaStatus = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const currentCam = cameraStreamRef.current;
      const currentScr = screenStreamRef.current;
      const camTrack = currentCam?.getVideoTracks()[0];
      const micTrack = currentCam?.getAudioTracks()[0];
      const scrTrack = currentScr?.getVideoTracks()[0];

      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'media_status',
            camera: Boolean(camTrack && camTrack.readyState === 'live'),
            mic: Boolean(micTrack && micTrack.readyState === 'live'),
            screen: Boolean(scrTrack && scrTrack.readyState === 'live'),
          })
        );
      } catch {}
    }
  }, []);

  /**
   * Initiate WebRTC offer to an authorized faculty client
   */
  const createOfferForFaculty = useCallback(
    async (facultyClientId: string, forceRestart: boolean = false) => {
      if (typeof window === 'undefined' || !window.RTCPeerConnection) return;

      const existing = peerConnectionsRef.current.get(facultyClientId);
      // Prevent glare: if offer negotiation is already in progress, avoid duplicate offers
      if (existing && !forceRestart) {
        if (existing.signalingState === 'have-local-offer') {
          return;
        }
        if (existing.connectionState === 'connected') {
          return;
        }
        existing.close();
      } else if (existing) {
        existing.close();
      }

      inFlightOffersRef.current.add(facultyClientId);
      const pc = new RTCPeerConnection(getIceConfiguration());
      peerConnectionsRef.current.set(facultyClientId, pc);
      pendingIceCandidatesRef.current.set(facultyClientId, []);

      syncTracksToPeer(pc);

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
          inFlightOffersRef.current.delete(facultyClientId);
        } else if (state === 'connecting') {
          setConnectionState('connecting');
        } else if (state === 'disconnected') {
          setConnectionState('disconnected');
          inFlightOffersRef.current.delete(facultyClientId);
          if (onConnectionLostRef.current) onConnectionLostRef.current();
        } else if (state === 'failed') {
          setConnectionState('failed');
          inFlightOffersRef.current.delete(facultyClientId);
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current += 1;
            setConnectionState('reconnecting');
            setTimeout(() => {
              if (isMountedRef.current) createOfferForFaculty(facultyClientId, true);
            }, 2000 * reconnectAttemptsRef.current);
          } else {
            if (onConnectionFailedRef.current) onConnectionFailedRef.current();
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
        inFlightOffersRef.current.delete(facultyClientId);
        console.error('Failed to create WebRTC offer for faculty:', err);
      }
    },
    [syncTracksToPeer, getStreamMap]
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
            sendMediaStatus();
            break;

          case 'faculty_joined':
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
            const facultyClientId = msg.sender_client_id;
            const pc = peerConnectionsRef.current.get(facultyClientId);
            if (pc && msg.sdp) {
              try {
                await pc.setRemoteDescription(
                  new RTCSessionDescription({
                    type: 'answer',
                    sdp: msg.sdp,
                  })
                );
                inFlightOffersRef.current.delete(facultyClientId);

                // Drain any buffered ICE candidates received before answer
                const pending = pendingIceCandidatesRef.current.get(facultyClientId) || [];
                for (const candidate of pending) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                  } catch (e) {
                    console.warn('Failed to apply queued ICE candidate:', e);
                  }
                }
                pendingIceCandidatesRef.current.delete(facultyClientId);
              } catch (err) {
                console.error('Failed to set remote answer description:', err);
              }
            }
            break;
          }

          case 'ice_candidate': {
            const facultyClientId = msg.sender_client_id;
            const pc = peerConnectionsRef.current.get(facultyClientId);
            if (pc && msg.candidate) {
              try {
                if (!pc.remoteDescription) {
                  // Buffer candidate until remoteDescription is set
                  const existing = pendingIceCandidatesRef.current.get(facultyClientId) || [];
                  existing.push(msg.candidate);
                  pendingIceCandidatesRef.current.set(facultyClientId, existing);
                } else {
                  await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
                }
              } catch (e) {
                console.warn('Could not add ICE candidate on student:', e);
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
              pendingIceCandidatesRef.current.delete(msg.faculty_client_id);
              inFlightOffersRef.current.delete(msg.faculty_client_id);
              setFacultyConnected(false);
              setConnectionState('idle');
            }
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Student signaling message processing error:', err);
      }
    },
    [createOfferForFaculty, sendMediaStatus]
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
      const url = getSignalingWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setConnectionState('connecting');
        sendMediaStatus();
      };

      ws.onmessage = handleSignalingMessage;

      ws.onerror = (err) => {
        console.warn('Signaling WebSocket encountered error:', err);
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        // If not deliberately closed, attempt bounded reconnection
        if (reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current += 1;
          setConnectionState('reconnecting');
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) connectSignaling();
          }, 3000);
        } else {
          setConnectionState('disconnected');
          if (onSignalingLostRef.current) onSignalingLostRef.current();
        }
      };
    } catch (err) {
      console.error('Failed to establish WebSocket connection:', err);
    }
  }, [examId, getSignalingWsUrl, handleSignalingMessage, sendMediaStatus]);

  // Sync tracks and notify faculty when cameraStream or screenStream is updated
  useEffect(() => {
    peerConnectionsRef.current.forEach((pc) => {
      syncTracksToPeer(pc);
    });
    sendMediaStatus();
  }, [cameraStream, screenStream, syncTracksToPeer, sendMediaStatus]);

  // Establish signaling connection once on mount or when examId changes
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
      pendingIceCandidatesRef.current.clear();
      inFlightOffersRef.current.clear();
    };
  }, [connectSignaling]);

  return {
    connectionState,
    facultyConnected,
    reconnect: connectSignaling,
  };
}
