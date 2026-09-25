'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LunaEvent, ParsedLunaPersonInfo } from './types';
import { parseLunaEvent } from './lunaHelpers';
import {
  Navigation,
  User,
  Camera,
  Tag,
  Clock,
  X,
  Maximize2,
  ZoomIn,
} from 'lucide-react';

interface LunaEventCardProps {
  event: LunaEvent;
  onTraceClick: (event: LunaEvent, info: ParsedLunaPersonInfo) => void;
  onSelect?: (event: LunaEvent) => void;
}

export const LunaEventCard: React.FC<LunaEventCardProps> = ({
  event,
  onTraceClick,
  onSelect,
}) => {
  const info = parseLunaEvent(event);
  const [sampleError, setSampleError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Full-view lightbox state for clicking detected image or match image
  const [lightbox, setLightbox] = useState<{
    url: string;
    title: string;
    subtitle: string;
  } | null>(null);

  // Similarity color thresholds:
  // 80% to 100% -> Green border
  // 60% to 79%  -> Yellow border
  // 0% to 59%   -> Red border
  const sim = info.similarity;
  let cardBorder = 'border-2 border-rose-500 shadow-rose-500/10';
  let badgeStyle = 'bg-rose-500 text-white border-rose-400';
  let dotColor = 'bg-rose-400';

  if (sim >= 80) {
    cardBorder = 'border-2 border-emerald-500 shadow-emerald-500/15';
    badgeStyle = 'bg-emerald-500 text-slate-950 border-emerald-400';
    dotColor = 'bg-emerald-400';
  } else if (sim >= 60) {
    cardBorder = 'border-2 border-amber-400 shadow-amber-400/15';
    badgeStyle = 'bg-amber-400 text-slate-950 border-amber-300';
    dotColor = 'bg-amber-400';
  }

  const dateTimeLabel = [info.dateFormatted, info.timeFormatted].filter(Boolean).join(' ') || info.timeFormatted;

  return (
    <>
      <div
        onClick={() => onSelect?.(event)}
        className={`group relative flex items-center gap-2 rounded-xl bg-slate-900/95 p-2 shadow-lg transition-all duration-200 hover:bg-slate-900 overflow-visible text-xs text-slate-200 select-none ${cardBorder}`}
      >
        {/* ── Left Area: Compact Detection Image + Overlapping Match Image ── */}
        <div className="relative shrink-0 w-20 h-28 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-visible">
          {/* Main Detected Image */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (info.sampleUrl && !sampleError) {
                setLightbox({
                  url: info.sampleUrl,
                  title: `Detected Person: ${info.name}`,
                  subtitle: `${info.cameraName} • ${dateTimeLabel}`,
                });
              }
            }}
            className="group/det relative w-full h-full rounded-lg overflow-hidden cursor-pointer"
            title="Click to view full image"
          >
            {info.sampleUrl && !sampleError ? (
              <>
                <img
                  src={info.sampleUrl}
                  alt="Detected Person"
                  className="w-full h-full object-cover rounded-lg transition-transform duration-300 group-hover/det:scale-110"
                  onError={() => setSampleError(true)}
                />
                {/* Click to expand overlay hint */}
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/det:opacity-100 transition-opacity flex items-center justify-center">
                  <Maximize2 className="w-4 h-4 text-white drop-shadow" />
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-[9px] gap-1 p-1 text-center bg-slate-950">
                <User className="w-5 h-5 text-slate-600" />
                <span>No Img</span>
              </div>
            )}

            {/* Time badge at bottom of thumbnail */}
            <span className="absolute bottom-0.5 left-0.5 right-0.5 bg-slate-950/85 text-[8px] text-cyan-300 font-mono text-center py-0.5 rounded border border-slate-800 pointer-events-none">
              {info.timeFormatted}
            </span>
          </div>

          {/* Match Image (Smaller, at Top-Right Corner of detection image as requested) */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (info.avatarUrl && !avatarError) {
                setLightbox({
                  url: info.avatarUrl,
                  title: `Match Reference: ${info.name}`,
                  subtitle: `${info.listName} • Similarity: ${sim}%`,
                });
              }
            }}
            className="group/match absolute -top-2 -right-2 z-20 w-8 h-8 rounded-md border-2 border-amber-500/90 bg-slate-950 shadow-xl overflow-hidden cursor-pointer flex items-center justify-center"
            title="Click to view full match image"
          >
            {info.avatarUrl && !avatarError ? (
              <>
                <img
                  src={info.avatarUrl}
                  alt="Match Reference"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover/match:scale-125"
                  onError={() => setAvatarError(true)}
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/match:opacity-100 transition-opacity flex items-center justify-center">
                  <ZoomIn className="w-3 h-3 text-amber-300 drop-shadow" />
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-[7px] text-center bg-slate-900">
                <User className="w-3 h-3 text-slate-600" />
              </div>
            )}
          </div>
        </div>

        {/* ── Right Area: Clean Metadata (Name, Cam Name, List, Date & Time, Similarity) ── */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-1 py-0.5">
          {/* Row 1: Name + Similarity Score */}
          <div className="flex items-center justify-between gap-1">
            <div
              className="font-bold text-slate-100 text-[11px] truncate flex items-center gap-1 min-w-0"
              title={info.name}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
              <span className="truncate">{info.name}</span>
            </div>

            <div
              className={`shrink-0 flex items-center justify-center px-1.5 py-0.5 rounded font-black text-[10px] shadow-sm border ${badgeStyle}`}
              title={`Similarity: ${sim}%`}
            >
              {sim}%
            </div>
          </div>

          {/* Row 2: Camera Name */}
          <div
            className="flex items-center gap-1 text-[10px] text-slate-300 bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/40 truncate"
            title={`Camera: ${info.cameraName}`}
          >
            <Camera className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate font-medium">{info.cameraName}</span>
          </div>

          {/* Row 3: List / Watchlist */}
          <div
            className="flex items-center gap-1 text-[9px] text-cyan-300 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-800/40 truncate"
            title={`List: ${info.listName}`}
          >
            <Tag className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
            <span className="truncate font-medium">{info.listName}</span>
          </div>

          {/* Row 4: Date & Time */}
          <div
            className="flex items-center gap-1 text-[9px] text-slate-400 font-mono truncate"
            title={`Time: ${dateTimeLabel}`}
          >
            <Clock className="w-2.5 h-2.5 text-slate-500 shrink-0" />
            <span className="truncate">{dateTimeLabel}</span>
          </div>

          {/* Row 5: Action Button (Trace) */}
          <div className="flex items-center justify-end pt-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTraceClick(event, info);
              }}
              title="Trace Person Movement"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-600/40 text-cyan-300 hover:text-cyan-100 border border-cyan-800/70 hover:border-cyan-500 text-[9px] font-semibold transition-colors"
            >
              <Navigation className="w-2.5 h-2.5 rotate-45" />
              <span>Trace</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Full-View Image Lightbox Modal ── */}
      <AnimatePresence>
        {lightbox && (
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-2xl max-h-[85vh] w-full rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Lightbox Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
                <div className="flex flex-col min-w-0 pr-4">
                  <h3 className="text-sm font-bold text-white truncate">{lightbox.title}</h3>
                  <p className="text-xs text-slate-400 font-mono truncate">{lightbox.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lightbox Image Preview */}
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/90 min-h-[300px]">
                <img
                  src={lightbox.url}
                  alt={lightbox.title}
                  className="max-h-[65vh] w-auto max-w-full object-contain rounded-lg shadow-lg border border-slate-800"
                />
              </div>

              {/* Lightbox Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800 bg-slate-950/70 text-xs text-slate-400">
                <span className="font-mono text-[11px]">{info.cameraName}</span>
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
