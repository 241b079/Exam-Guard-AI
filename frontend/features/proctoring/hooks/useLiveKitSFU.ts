'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  LocalTrackPublication,
  ConnectionState,
} from 'livekit-client';
import { sfuService } from '../services/sfuService';

export interface UseLiveKitSFUOptions {
  examId: string;
  role: 'student' | 'faculty';
  attemptId?: string;
  cameraStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  onTrackSubscribed?: (studentId: string, mediaStream: MediaStream, kind: 'camera' | 'screen' | 'audio') => void;
  onTrackUnsubscribed?: (studentId: string, kind: 'camera' | 'screen' | 'audio') => void;
  onStudentDisconnected?: (studentId: string) => void;
  onSfuStatusChange?: (isConnected: boolean, isSfuActive: boolean) => void;
}

export function useLiveKitSFU({
  examId,
  role,
  attemptId,
  cameraStream,
  screenStream,
  onTrackSubscribed,
  onTrackUnsubscribed,
  onStudentDisconnected,
  onSfuStatusChange,
}: UseLiveKitSFUOptions) {
  const [isSfuConnected, setIsSfuConnected] = useState(false);
  const [isSfuActive, setIsSfuActive] = useState(false);
  const [sfuError, setSfuError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const isMountedRef = useRef(true);
  const publicationsRef = useRef<Map<string, LocalTrackPublication>>(new Map());
  const remoteTracksStoreRef = useRef<Map<string, { camera?: MediaStream; screen?: MediaStream; audio?: MediaStream }>>(new Map());
  const remotePublicationsMapRef = useRef<Map<string, RemoteTrackPublication[]>>(new Map());

  // Extract pure student ID from identity (e.g. "stu_UUID" -> "UUID")
  const parseStudentId = (identity: string): string => {
    return identity.startsWith('stu_') ? identity.slice(4) : identity;
  };

  /**
   * Adjusts the stream quality layer for a given candidate's video:
   * Low (180p thumbnails) for overview grid vs High (720p/1080p) when focused.
   */
  const setCandidateStreamQuality = useCallback((studentId: string, quality: 'low' | 'high') => {
    const pubs = remotePublicationsMapRef.current.get(studentId) || [];
    for (const pub of pubs) {
      if (pub.kind === Track.Kind.Video) {
        pub.setVideoQuality(quality === 'high' ? VideoQuality.HIGH : VideoQuality.LOW);
      }
    }
  }, []);

  /**
   * Connect to the SFU room
   */
  const connectSFU = useCallback(async () => {
    if (typeof window === 'undefined' || !examId) return false;

    try {
      setSfuError(null);
      // 1. Fetch SFU access token and server endpoint from backend
      const sfuConfig = await sfuService.getSfuToken(examId, attemptId);
      if (!sfuConfig.sfu_enabled) {
        setIsSfuActive(false);
        setIsSfuConnected(false);
        onSfuStatusChange?.(false, false);
        return false;
      }

      // 2. Initialize LiveKit Room with Dynacast and Adaptive Streaming enabled
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: { width: 1280, height: 720, frameRate: 24 },
        },
      });
      roomRef.current = room;

      // 3. Register remote track event handlers (for faculty proctors)
      if (role === 'faculty') {
        room.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
            const studentId = parseStudentId(participant.identity);

            // Keep track of publication for dynamic bandwidth quality switching
            const existingPubs = remotePublicationsMapRef.current.get(studentId) || [];
            remotePublicationsMapRef.current.set(studentId, [...existingPubs, publication]);

            // Save bandwidth: set low-bitrate thumbnail mode by default for overview grid
            if (publication.kind === Track.Kind.Video) {
              publication.setVideoQuality(VideoQuality.LOW);
            }

            // Wrap track in a standard MediaStream
            const stream = new MediaStream([track.mediaStreamTrack]);
            let studentStreams = remoteTracksStoreRef.current.get(studentId);
            if (!studentStreams) {
              studentStreams = {};
              remoteTracksStoreRef.current.set(studentId, studentStreams);
            }

            const trackName = publication.trackName?.toLowerCase() || '';
            const isScreen = trackName.includes('screen') || publication.source === Track.Source.ScreenShare;

            if (isScreen) {
              studentStreams.screen = stream;
              onTrackSubscribed?.(studentId, stream, 'screen');
            } else if (publication.kind === Track.Kind.Video) {
              studentStreams.camera = stream;
              onTrackSubscribed?.(studentId, stream, 'camera');
            } else if (publication.kind === Track.Kind.Audio) {
              studentStreams.audio = stream;
              onTrackSubscribed?.(studentId, stream, 'audio');
            }
          }
        );

        room.on(
          RoomEvent.TrackUnsubscribed,
          (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
            const studentId = parseStudentId(participant.identity);
            const trackName = publication.trackName?.toLowerCase() || '';
            const isScreen = trackName.includes('screen') || publication.source === Track.Source.ScreenShare;

            if (isScreen) {
              onTrackUnsubscribed?.(studentId, 'screen');
            } else if (publication.kind === Track.Kind.Video) {
              onTrackUnsubscribed?.(studentId, 'camera');
            } else if (publication.kind === Track.Kind.Audio) {
              onTrackUnsubscribed?.(studentId, 'audio');
            }
          }
        );

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          const studentId = parseStudentId(participant.identity);
          remoteTracksStoreRef.current.delete(studentId);
          remotePublicationsMapRef.current.delete(studentId);
          onStudentDisconnected?.(studentId);
        });
      }

      // Room connection state updates
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (!isMountedRef.current) return;
        const connected = state === ConnectionState.Connected;
        setIsSfuConnected(connected);
        onSfuStatusChange?.(connected, true);
      });

      // 4. Connect to SFU media server
      await room.connect(sfuConfig.server_url, sfuConfig.token);
      setIsSfuActive(true);
      setIsSfuConnected(true);
      onSfuStatusChange?.(true, true);

      // 5. If Student, publish camera and screen tracks with simulcast
      if (role === 'student' && room.localParticipant) {
        if (cameraStream) {
          const videoTrack = cameraStream.getVideoTracks()[0];
          if (videoTrack) {
            const pub = await room.localParticipant.publishTrack(videoTrack, {
              name: 'camera',
              simulcast: true, // Enables multi-layer encodings for SFU bandwidth optimization
            });
            publicationsRef.current.set('camera', pub);
          }
          const audioTrack = cameraStream.getAudioTracks()[0];
          if (audioTrack) {
            const pub = await room.localParticipant.publishTrack(audioTrack, {
              name: 'microphone',
            });
            publicationsRef.current.set('microphone', pub);
          }
        }

        if (screenStream) {
          const screenVideo = screenStream.getVideoTracks()[0];
          if (screenVideo) {
            const pub = await room.localParticipant.publishTrack(screenVideo, {
              name: 'screen',
              source: Track.Source.ScreenShare,
              simulcast: false,
            });
            publicationsRef.current.set('screen', pub);
          }
        }
      }

      return true;
    } catch (err: any) {
      console.warn('SFU connection failed, will use P2P mesh fallback:', err.message || err);
      setSfuError(err.message || 'SFU unreachable');
      setIsSfuActive(false);
      setIsSfuConnected(false);
      onSfuStatusChange?.(false, false);
      return false;
    }
  }, [examId, role, attemptId, cameraStream, screenStream, onTrackSubscribed, onTrackUnsubscribed, onStudentDisconnected, onSfuStatusChange]);

  /**
   * Publish dynamically updated tracks (e.g. when screen share starts during exam)
   */
  useEffect(() => {
    if (role === 'student' && roomRef.current?.localParticipant && isSfuConnected) {
      const local = roomRef.current.localParticipant;
      if (screenStream && !publicationsRef.current.has('screen')) {
        const screenTrack = screenStream.getVideoTracks()[0];
        if (screenTrack) {
          local.publishTrack(screenTrack, {
            name: 'screen',
            source: Track.Source.ScreenShare,
            simulcast: false,
          }).then((pub) => {
            publicationsRef.current.set('screen', pub);
          }).catch((err) => console.warn('Failed to publish screen to SFU:', err));
        }
      }
    }
  }, [screenStream, isSfuConnected, role]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, []);

  return {
    isSfuConnected,
    isSfuActive,
    sfuError,
    connectSFU,
    setCandidateStreamQuality,
  };
}
