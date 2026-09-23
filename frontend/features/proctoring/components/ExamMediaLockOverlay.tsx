import React from 'react';
import { AlertTriangle, Camera, Mic, Monitor, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ExamMediaLockOverlayProps {
  isOpen: boolean;
  lostType: 'camera' | 'microphone' | 'screen' | 'connection' | null;
  onResume: () => void;
  isResuming?: boolean;
}

export function ExamMediaLockOverlay({
  isOpen,
  lostType,
  onResume,
  isResuming = false,
}: ExamMediaLockOverlayProps) {
  if (!isOpen || !lostType) return null;

  const getDetails = () => {
    switch (lostType) {
      case 'screen':
        return {
          icon: <Monitor className="w-8 h-8 text-rose-600" />,
          title: 'Screen Sharing Stopped',
          message:
            'Your desktop screen sharing has been stopped or interrupted. Your exam view is temporarily locked to protect exam integrity.',
          action: 'Resume Entire Screen Sharing',
        };
      case 'camera':
        return {
          icon: <Camera className="w-8 h-8 text-rose-600" />,
          title: 'Camera Feed Lost',
          message:
            'Your webcam connection was interrupted or disabled. Live video monitoring is required for this examination.',
          action: 'Restore Camera Feed',
        };
      case 'microphone':
        return {
          icon: <Mic className="w-8 h-8 text-rose-600" />,
          title: 'Microphone Audio Lost',
          message:
            'Your microphone track was disconnected. Audio proctoring is mandatory during this exam session.',
          action: 'Restore Microphone',
        };
      default:
        return {
          icon: <AlertTriangle className="w-8 h-8 text-rose-600" />,
          title: 'Media Proctoring Interrupted',
          message:
            'Live monitoring stream connection was lost. Please reconnect your media streams to continue the exam.',
          action: 'Reconnect Media',
        };
    }
  };

  const details = getDetails();

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-rose-200 shadow-2xl max-w-md w-full p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-3xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto shadow-inner">
          {details.icon}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold font-serif text-stone-900">{details.title}</h2>
          <p className="text-xs text-stone-600 leading-relaxed">{details.message}</p>
        </div>

        <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-[11px] text-amber-900 font-medium">
          Note: This violation has been recorded. Do not navigate away from this window.
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={onResume}
          isLoading={isResuming}
          className="w-full gap-2 text-sm bg-rose-600 hover:bg-rose-700 shadow-warm"
        >
          <RefreshCw className="w-4 h-4" /> {details.action}
        </Button>
      </div>
    </div>
  );
}
