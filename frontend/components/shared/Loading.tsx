import React from 'react';

export const Loading: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-[#EBE5DC]"></div>
        <div className="absolute inset-0 rounded-full border-4 border-[#C25E1A] border-t-transparent animate-spin"></div>
      </div>
      <p className="text-sm font-medium text-stone-500">{message}</p>
    </div>
  );
};

