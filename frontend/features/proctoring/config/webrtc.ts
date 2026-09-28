/**
 * WebRTC and ICE Configuration for Cross-Device Proctoring.
 *
 * Configures STUN/TURN servers via environment variables (NEXT_PUBLIC_ICE_SERVERS).
 * Defaults to reliable public STUN servers for local/ngrok development.
 * In restrictive corporate/NAT networks, TURN servers can be supplied via NEXT_PUBLIC_ICE_SERVERS:
 * Example:
 *   NEXT_PUBLIC_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]'
 */

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export function getIceConfiguration(): RTCConfiguration {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ICE_SERVERS) {
    try {
      const parsed = JSON.parse(process.env.NEXT_PUBLIC_ICE_SERVERS);
      if (Array.isArray(parsed)) {
        return {
          iceServers: parsed,
          iceCandidatePoolSize: 2,
        };
      }
      if (parsed.iceServers) {
        return {
          iceCandidatePoolSize: 2,
          ...parsed,
        };
      }
    } catch (err) {
      console.warn('Failed to parse NEXT_PUBLIC_ICE_SERVERS, using fallback STUN servers:', err);
    }
  }

  return {
    iceServers: DEFAULT_ICE_SERVERS,
    iceCandidatePoolSize: 2,
  };
}
