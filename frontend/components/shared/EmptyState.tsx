import React from 'react';
import { Layers } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  badge?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description = 'Coming in Phase 2.',
  badge
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-slate-700/60 bg-slate-800/30 space-y-3">
      <div className="p-3 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
        <Layers className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      {badge && (
        <span className="px-2.5 py-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md">
          {badge}
        </span>
      )}
    </div>
  );
};
