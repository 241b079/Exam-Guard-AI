'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ViolationType } from '@/features/attempts';
import { attemptService } from '@/features/attempts/services/attemptService';

export interface UseExamLockdownOptions {
  attemptId?: string;
  isActive: boolean;
  initialViolationCount?: number;
  onViolationRecorded?: (type: ViolationType) => void;
}

export interface UseExamLockdownReturn {
  isFullscreen: boolean;
  isFullscreenRequired: boolean;
  violationCount: number;
  activeWarning: string | null;
  requestFullscreen: () => Promise<boolean>;
  exitFullscreen: () => Promise<void>;
  recordManualViolation: (type: ViolationType, metadata?: Record<string, any>) => Promise<void>;
}

export function useExamLockdown({
  attemptId,
  isActive,
  initialViolationCount = 0,
  onViolationRecorded,
}: UseExamLockdownOptions): UseExamLockdownReturn {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [violationCount, setViolationCount] = useState<number>(initialViolationCount);
  const [activeWarning, setActiveWarning] = useState<string | null>(null);

  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastViolationMapRef = useRef<Map<string, number>>(new Map());
  const isSubmittingOrEndedRef = useRef<boolean>(!isActive);

  useEffect(() => {
    isSubmittingOrEndedRef.current = !isActive;
  }, [isActive]);

  useEffect(() => {
    setViolationCount(initialViolationCount);
  }, [initialViolationCount]);

  // Show a non-intrusive banner warning to candidate
  const triggerWarning = useCallback((message: string) => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    setActiveWarning(message);
    warningTimeoutRef.current = setTimeout(() => {
      setActiveWarning(null);
    }, 4500);
  }, []);

  // Centralized violation dispatcher with robust client-side deduplication
  const recordViolation = useCallback(
    async (type: ViolationType, metadata: Record<string, any> = {}) => {
      if (isSubmittingOrEndedRef.current || !attemptId) return;

      const now = Date.now();
      const lastSameType = lastViolationMapRef.current.get(type) || 0;

      // 1. Same-event debounce (2000ms)
      if (now - lastSameType < 2000) {
        return;
      }

      // 2. Cross-event deduplication for Tab/Window switching:
      // Tab switch triggers both visibilitychange (hidden) and blur within milliseconds.
      if (type === 'WINDOW_BLUR') {
        const lastHidden = lastViolationMapRef.current.get('PAGE_HIDDEN') || 0;
        if (now - lastHidden < 1200) {
          return;
        }
      }
      if (type === 'PAGE_HIDDEN') {
        const lastBlur = lastViolationMapRef.current.get('WINDOW_BLUR') || 0;
        if (now - lastBlur < 1200) {
          return;
        }
      }

      lastViolationMapRef.current.set(type, now);
      setViolationCount((prev) => prev + 1);

      // Warning message tailored to violation type
      let warningText = 'Exam integrity notice: Browser event recorded.';
      if (type === 'FULLSCREEN_EXIT') {
        warningText = 'Fullscreen mode was exited. This action has been recorded.';
      } else if (type === 'CONTEXT_MENU') {
        warningText = 'Right-click context menu is restricted during the exam.';
      } else if (type === 'COPY_ATTEMPT') {
        warningText = 'Copy shortcut is restricted during the exam.';
      } else if (type === 'PASTE_ATTEMPT') {
        warningText = 'Paste shortcut is restricted during the exam.';
      } else if (type === 'CUT_ATTEMPT') {
        warningText = 'Cut shortcut is restricted during the exam.';
      } else if (type === 'PAGE_HIDDEN' || type === 'WINDOW_BLUR') {
        warningText = 'Exam window lost focus. This action has been recorded.';
      }

      triggerWarning(warningText);
      onViolationRecorded?.(type);

      try {
        await attemptService.recordViolation(attemptId, {
          violation_type: type,
          timestamp: new Date().toISOString(),
          metadata: {
            ...metadata,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          },
        });
      } catch (err) {
        // Silently catch background network error to never disrupt student exam flow
        console.warn('Failed to dispatch integrity violation to server:', err);
      }
    },
    [attemptId, onViolationRecorded, triggerWarning]
  );

  // Fullscreen helper
  const requestFullscreen = useCallback(async (): Promise<boolean> => {
    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
      setIsFullscreen(true);
      return true;
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
      return false;
    }
  }, []);

  const exitFullscreen = useCallback(async (): Promise<void> => {
    try {
      const doc = document as any;
      if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        }
      }
      setIsFullscreen(false);
    } catch {
      // Ignore exit errors
    }
  }, []);

  // Main listener setup and cleanup lifecycle
  useEffect(() => {
    if (!isActive) {
      return;
    }

    // Check initial fullscreen state
    const checkFullscreenState = () => {
      const doc = document as any;
      const isFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
      setIsFullscreen(isFs);
      return isFs;
    };

    checkFullscreenState();

    // 1. Fullscreen Change Handler
    const handleFullscreenChange = () => {
      const isFs = checkFullscreenState();
      if (!isFs && !isSubmittingOrEndedRef.current) {
        recordViolation('FULLSCREEN_EXIT', {
          reason: 'Browser fullscreen exited',
        });
      }
    };

    // 2. Context Menu Handler (Right Click)
    const handleContextMenu = (e: MouseEvent) => {
      if (isSubmittingOrEndedRef.current) return;
      e.preventDefault();
      recordViolation('CONTEXT_MENU', {
        x: e.clientX,
        y: e.clientY,
      });
    };

    // 3. Clipboard events (Copy, Paste, Cut)
    const handleCopy = (e: ClipboardEvent) => {
      if (isSubmittingOrEndedRef.current) return;
      e.preventDefault();
      recordViolation('COPY_ATTEMPT');
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (isSubmittingOrEndedRef.current) return;
      e.preventDefault();
      recordViolation('PASTE_ATTEMPT');
    };

    const handleCut = (e: ClipboardEvent) => {
      if (isSubmittingOrEndedRef.current) return;
      e.preventDefault();
      recordViolation('CUT_ATTEMPT');
    };

    // 4. Keyboard Shortcuts Handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmittingOrEndedRef.current) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Block Copy, Paste, Cut via shortcuts
      if (isCtrlOrCmd) {
        if (key === 'c') {
          e.preventDefault();
          recordViolation('COPY_ATTEMPT');
          return;
        }
        if (key === 'v') {
          e.preventDefault();
          recordViolation('PASTE_ATTEMPT');
          return;
        }
        if (key === 'x') {
          e.preventDefault();
          recordViolation('CUT_ATTEMPT');
          return;
        }
        // Block Print, Save, View Source
        if (key === 'p' || key === 's' || key === 'u') {
          e.preventDefault();
          return;
        }
      }

      // Block Alt + ArrowLeft / ArrowRight browser navigation
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        return;
      }
    };

    // 5. Visibility Change (Tab Switch Detection)
    const handleVisibilityChange = () => {
      if (isSubmittingOrEndedRef.current) return;
      if (document.visibilityState === 'hidden') {
        recordViolation('PAGE_HIDDEN', {
          visibilityState: document.visibilityState,
        });
      }
    };

    // 6. Window Blur & Focus Detection
    const handleBlur = () => {
      if (isSubmittingOrEndedRef.current) return;
      recordViolation('WINDOW_BLUR');
    };

    const handleFocus = () => {
      // Focus regained (recovery)
    };

    // Register all event listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    window.addEventListener('cut', handleCut);
    window.addEventListener('keydown', handleKeyDown);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    // Teardown / Cleanup: Remove all listeners unconditionally when unmounting or exam finishes
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);

      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('cut', handleCut);
      window.removeEventListener('keydown', handleKeyDown);

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);

      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [isActive, recordViolation]);

  return {
    isFullscreen,
    isFullscreenRequired: isActive && !isFullscreen,
    violationCount,
    activeWarning,
    requestFullscreen,
    exitFullscreen,
    recordManualViolation: recordViolation,
  };
}
