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
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-[#D8CFBF] bg-[#FDFCFB] space-y-3">
      <div className="p-3 rounded-full bg-[#F5EFEB] text-stone-500 border border-[#E3DCD2]">
        <Layers className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-stone-800 font-serif">{title}</h4>
        <p className="text-xs text-stone-500">{description}</p>
      </div>
      {badge && (
        <span className="px-2.5 py-1 text-[11px] font-medium text-amber-800 bg-[#FEF3C7] border border-[#FDE68A] rounded-full">
          {badge}
        </span>
      )}
    </div>
  );
};

