'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { MovementTracePoint } from './types';

const FaceMovementTraceMap = dynamic(
  () => import('./FaceMovementTraceMap').then((mod) => mod.FaceMovementTraceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#090d16] text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span>Loading Offline Surveillance Map…</span>
        </div>
      </div>
    ),
  }
);

interface FaceMovementTraceMapLoaderProps {
  tracePoints: MovementTracePoint[];
  selectedPointId?: string | null;
  onSelectPoint?: (point: MovementTracePoint) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  className?: string;
}

export const FaceMovementTraceMapLoader: React.FC<FaceMovementTraceMapLoaderProps> = (props) => {
  return <FaceMovementTraceMap {...props} />;
};
