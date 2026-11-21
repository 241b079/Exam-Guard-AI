'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { attemptService } from '@/features/attempts/services/attemptService';

export interface UseEnvironmentIntegrityOptions {
  attemptId?: string | null;
  cameraStream: MediaStream | null;
  isActive: boolean;
  onSecurityAlert?: (type: string, message: string) => void;
}

export function useEnvironmentIntegrity({
  attemptId,
  cameraStream,
  isActive,
  onSecurityAlert,
}: UseEnvironmentIntegrityOptions) {
  const [hasMultipleDisplays, setHasMultipleDisplays] = useState(false);
  const [hasVirtualCamera, setHasVirtualCamera] = useState(false);
  const [hasVMDetected, setHasVMDetected] = useState(false);

  const checkedOnceRef = useRef(false);
  const lastMultiDisplayViolationRef = useRef<number>(0);
  const onSecurityAlertRef = useRef(onSecurityAlert);

  useEffect(() => {
    onSecurityAlertRef.current = onSecurityAlert;
  }, [onSecurityAlert]);

  // 1. Virtual Camera / Device Validation
  const checkVirtualCamera = useCallback(async () => {
    if (!cameraStream) return;

    const BANNED_PATTERNS = [
      'virtual',
      'obs',
      'manycam',
      'camo',
      'fake',
      'v4l2loopback',
      'droidcam',
      'splitcam',
      'ndi',
      'e2esoft',
      'snap camera',
      'unity',
    ];

    const tracks = cameraStream.getVideoTracks();
    for (const track of tracks) {
      const label = (track.label || '').toLowerCase();
      const isVirtual = BANNED_PATTERNS.some((pattern) => label.includes(pattern));

      if (isVirtual) {
        setHasVirtualCamera(true);
        const msg = `Virtual camera device detected: "${track.label}". Physical webcam required.`;
        onSecurityAlertRef.current?.('VIRTUAL_CAMERA_DETECTED', msg);

        if (attemptId) {
          try {
            await attemptService.recordViolation(attemptId, {
              violation_type: 'VIRTUAL_CAMERA_DETECTED' as any,
              timestamp: new Date().toISOString(),
              metadata: {
                deviceLabel: track.label,
                deviceId: track.id,
                description: msg,
              },
            });
          } catch (err) {
            console.debug('[EnvironmentIntegrity] Virtual camera report error:', err);
          }
        }
        return;
      }
    }
  }, [cameraStream, attemptId]);

  // 2. Multi-Display / External Monitor Detection
  const checkMultipleDisplays = useCallback(async () => {
    if (typeof window === 'undefined') return;

    let isMulti = false;
    let detail = '';

    // Check Window Management API
    if (typeof window.screen !== 'undefined') {
      if ((window.screen as any).isExtended === true) {
        isMulti = true;
        detail = 'Secondary monitor detected via isExtended screen property.';
      } else if (
        window.screen.availWidth > window.screen.width * 1.5 ||
        window.screen.availHeight > window.screen.height * 1.5
      ) {
        isMulti = true;
        detail = 'Extended desktop geometry detected.';
      }
    }

    if (isMulti) {
      setHasMultipleDisplays(true);
      const now = Date.now();
      if (now - lastMultiDisplayViolationRef.current > 15000) {
        lastMultiDisplayViolationRef.current = now;
        const msg = 'Multiple monitors detected. External displays must be disconnected.';
        onSecurityAlertRef.current?.('MULTIPLE_DISPLAYS_DETECTED', msg);

        if (attemptId) {
          try {
            await attemptService.recordViolation(attemptId, {
              violation_type: 'MULTIPLE_DISPLAYS_DETECTED' as any,
              timestamp: new Date().toISOString(),
              metadata: {
                detail,
                availWidth: window.screen.availWidth,
                screenWidth: window.screen.width,
              },
            });
          } catch (err) {
            console.debug('[EnvironmentIntegrity] Multi-display report error:', err);
          }
        }
      }
    } else {
      setHasMultipleDisplays(false);
    }
  }, [attemptId]);

  // 3. Virtual Machine (VM) / Sandbox Detection
  const checkVirtualMachine = useCallback(async () => {
    if (typeof document === 'undefined') return;

    try {
      const canvas = document.createElement('canvas');
      const gl =
        (canvas.getContext('webgl') as WebGLRenderingContext) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext);

      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = (
            gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
          ).toLowerCase();
          const vendor = (
            gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || ''
          ).toLowerCase();

          const VM_KEYWORDS = [
            'vmware',
            'virtualbox',
            'qemu',
            'llvmpipe',
            'softpipe',
            'parallels',
            'bhyve',
            'hyper-v',
          ];

          const isVM = VM_KEYWORDS.some(
            (kw) => renderer.includes(kw) || vendor.includes(kw)
          );

          if (isVM) {
            setHasVMDetected(true);
            const msg = `Virtual Machine execution detected (${renderer}). Native host operating system required.`;
            onSecurityAlertRef.current?.('VIRTUAL_MACHINE_DETECTED', msg);

            if (attemptId) {
              await attemptService.recordViolation(attemptId, {
                violation_type: 'VIRTUAL_MACHINE_DETECTED' as any,
                timestamp: new Date().toISOString(),
                metadata: {
                  renderer,
                  vendor,
                  description: msg,
                },
              });
            }
          }
        }
      }
    } catch {
      // Gracefully catch security context restrictions
    }
  }, [attemptId]);

  useEffect(() => {
    if (!isActive) return;

    if (!checkedOnceRef.current) {
      checkedOnceRef.current = true;
      checkVirtualCamera();
      checkVirtualMachine();
    }

    checkMultipleDisplays();

    // Listen for display changes (e.g. plugging in HDMI)
    const handleResize = () => checkMultipleDisplays();
    window.addEventListener('resize', handleResize);

    const intervalId = setInterval(() => {
      checkMultipleDisplays();
    }, 10000);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(intervalId);
    };
  }, [isActive, checkVirtualCamera, checkMultipleDisplays, checkVirtualMachine]);

  return {
    hasMultipleDisplays,
    hasVirtualCamera,
    hasVMDetected,
  };
}
