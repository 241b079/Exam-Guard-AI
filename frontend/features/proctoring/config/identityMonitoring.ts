/**
 * Centralized Configuration for Continuous Live Identity Verification
 * and Suspicious Evidence Detection.
 */

export const IDENTITY_MONITORING_CONFIG = {
  // Interval between consecutive sampled camera frames (milliseconds)
  FRAME_SAMPLING_INTERVAL_MS: 1500,

  // Duration in seconds an identity mismatch must persist before confirming
  IDENTITY_MISMATCH_CONFIRM_SECONDS: 3.0,

  // Grace period in seconds for temporary absence (face not detected)
  ABSENCE_GRACE_SECONDS: 5.0,

  // Duration in seconds multiple persons must be detected before confirming
  MULTIPLE_PERSON_CONFIRM_SECONDS: 2.0,

  // Cooldown in seconds before allowing an additional evidence screenshot snapshot for the same incident
  INCIDENT_COOLDOWN_SECONDS: 30.0,

  // Maximum canvas dimension to resize captured frames for optimal processing and minimal network payload
  FRAME_MAX_WIDTH: 640,
  FRAME_MAX_HEIGHT: 480,
  FRAME_JPEG_QUALITY: 0.85,
} as const;

export type IdentityMonitoringConfig = typeof IDENTITY_MONITORING_CONFIG;
