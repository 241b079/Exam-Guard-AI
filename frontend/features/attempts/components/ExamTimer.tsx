'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface ExamTimerProps {
  initialSeconds: number;
  onTimeExpired: () => void;
  displayCountdown?: boolean;
}

export const ExamTimer: React.FC<ExamTimerProps> = ({
  initialSeconds,
  onTimeExpired,
  displayCountdown = true,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onTimeExpired();
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimeExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft, onTimeExpired]);

  const formatTime = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isWarning = secondsLeft < 300; // Less than 5 mins

  if (!displayCountdown) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
        <Clock className="w-4 h-4" /> Exam In Progress
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold font-mono transition-all ${
        isWarning
          ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
          : 'bg-[#FAF7F2] border-[#E3DCD2] text-stone-800'
      }`}
    >
      {isWarning ? <AlertTriangle className="w-4 h-4 text-rose-600" /> : <Clock className="w-4 h-4 text-[#C25E1A]" />}
      <span>Time Remaining: {formatTime(secondsLeft)}</span>
    </div>
  );
};

