'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LunaEvent, ParsedLunaPersonInfo } from './types';
import { parseLunaEvent, resolveLunaSampleUrl } from './lunaHelpers';
import { directFetchLunaFace } from '@/lib/lunaDirectClient';
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

const clientAvatarCache = new Map<string, string>();

export const LunaEventCard: React.FC<LunaEventCardProps> = ({
  event,
  onTraceClick,
  onSelect,
}) => {
  const info = parseLunaEvent(event);
  const [sampleError, setSampleError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Matched / enrolled original face avatar state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    return info.avatarUrl || (info.faceId ? clientAvatarCache.get(info.faceId) || null : null);
  });

  useEffect(() => {
    if (info.avatarUrl) {
      setAvatarUrl(info.avatarUrl);
      if (info.faceId) clientAvatarCache.set(info.faceId, info.avatarUrl);
      return;
    }
    if (!info.faceId) return;

    if (clientAvatarCache.has(info.faceId)) {
      setAvatarUrl(clientAvatarCache.get(info.faceId) || null);
      return;
    }

    let isMounted = true;
    directFetchLunaFace(info.faceId)
      .then((data) => {
        if (isMounted && data?.avatar) {
          const resolved = resolveLunaSampleUrl(data.avatar);
          if (resolved) {
            clientAvatarCache.set(info.faceId!, resolved);
            setAvatarUrl(resolved);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [info.faceId, info.avatarUrl]);

  // Full-view lightbox state
  const [lightbox, setLightbox] = useState<{
    url: string;
    title: string;
    subtitle: string;
  } | null>(null);

  const dateTimeLabel = [info.dateFormatted, info.timeFormatted].filter(Boolean).join(' ') || info.timeFormatted;
  const detectedImageUrl = info.detectedFaceUrl || info.sampleUrl || info.frameUrl;
  const hasMatchedAvatar = Boolean(avatarUrl && !avatarError);

  // Dynamic color palette per wireframe (Green >= 80%, Yellow 60-79%, Red < 60%)
  const sim = info.similarity;
  let cardBorder = 'border-2 border-rose-500/90 shadow-[0_0_14px_rgba(244,63,94,0.18)]';
  let cardBg = 'bg-gradient-to-r from-slate-950 via-slate-900 to-rose-950/30';
  let badgeStyle = 'bg-rose-500 text-white border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
  let nameBlock = 'bg-slate-800/90 text-rose-200 border-slate-700/70';
  let camBlock = 'bg-slate-800/70 text-slate-300 border-slate-700/50';
  let listBlock = 'bg-rose-950/40 text-rose-300 border-rose-800/50';
  let matchBorder = 'border-2 border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]';
  let traceBtn = 'bg-rose-600/30 hover:bg-rose-500/50 text-rose-200 border-rose-500/60';
  let dotColor = 'bg-rose-400';

  if (sim >= 80) {
    cardBorder = 'border-2 border-emerald-500/90 shadow-[0_0_14px_rgba(16,185,129,0.18)]';
    cardBg = 'bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950/30';
    badgeStyle = 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
    nameBlock = 'bg-slate-800/90 text-emerald-200 border-slate-700/70';
    camBlock = 'bg-slate-800/70 text-slate-300 border-slate-700/50';
    listBlock = 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50';
    matchBorder = 'border-2 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
    traceBtn = 'bg-emerald-600/30 hover:bg-emerald-500/50 text-emerald-200 border-emerald-500/60';
    dotColor = 'bg-emerald-400';
  } else if (sim >= 60) {
    cardBorder = 'border-2 border-amber-400/90 shadow-[0_0_14px_rgba(245,158,11,0.18)]';
    cardBg = 'bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/30';
    badgeStyle = 'bg-amber-400 text-slate-950 border-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.4)]';
    nameBlock = 'bg-slate-800/90 text-amber-200 border-slate-700/70';
    camBlock = 'bg-slate-800/70 text-slate-300 border-slate-700/50';
    listBlock = 'bg-amber-950/40 text-amber-300 border-amber-800/50';
    matchBorder = 'border-2 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]';
    traceBtn = 'bg-amber-600/30 hover:bg-amber-500/50 text-amber-200 border-amber-500/60';
    dotColor = 'bg-amber-400';
  }

  return (
    <>
      <div
        onClick={() => onSelect?.(event)}
        className={`group relative flex items-stretch rounded-xl p-2 shadow-lg transition-all duration-200 hover:brightness-105 cursor-pointer text-xs select-none mt-2.5 overflow-visible ${cardBorder} ${cardBg}`}
      >
        {/* ── Left Area: Large Camera Detected Image (Blue in wireframe) ── */}
        <div className="relative shrink-0 w-24 h-28 flex items-center justify-center">
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (detectedImageUrl && !sampleError) {
                setLightbox({
                  url: detectedImageUrl,
                  title: `Detected Person: ${info.name}`,
                  subtitle: `${info.cameraName} • ${dateTimeLabel}`,
                });
              }
            }}
            className="group/det relative w-full h-full rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-center overflow-hidden shadow-inner cursor-pointer"
            title="Click to view full detected image"
          >
            {detectedImageUrl && !sampleError ? (
              <>
                <img
                  src={detectedImageUrl}
                  alt="Detected Person"
                  className="w-full h-full object-cover rounded-lg transition-transform duration-300 group-hover/det:scale-110"
                  onError={() => setSampleError(true)}
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/det:opacity-100 transition-opacity flex items-center justify-center">
                  <Maximize2 className="w-3.5 h-3.5 text-white drop-shadow" />
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-[8px] gap-1 p-1 text-center bg-slate-950">
                <User className="w-4 h-4 text-slate-600" />
                <span>No Img</span>
              </div>
            )}

            {/* Sub-label badge */}
            <span className="absolute bottom-0 inset-x-0 bg-slate-950/90 text-[7px] text-cyan-300 font-mono text-center py-0.5 border-t border-slate-800 pointer-events-none">
              DETECTED
            </span>
          </div>
        </div>

        {/* ── Overlapping Match Image Badge (Brown box in wireframe) ── */}
        {hasMatchedAvatar && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (avatarUrl && !avatarError) {
                setLightbox({
                  url: avatarUrl,
                  title: `Matched Reference (Original): ${info.name}`,
                  subtitle: `${info.listName} • Similarity: ${sim}%`,
                });
              }
            }}
            className={`group/match absolute -top-2.5 left-[74px] z-20 w-11 h-14 rounded-lg bg-slate-950 ${matchBorder} flex items-center justify-center overflow-hidden cursor-pointer transition-transform duration-200 hover:scale-110`}
            title="Click to view original match photo"
          >
            <img
              src={avatarUrl!}
              alt="Match Reference"
              className="w-full h-full object-cover rounded-md"
              onError={() => setAvatarError(true)}
            />
            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/match:opacity-100 transition-opacity flex items-center justify-center">
              <ZoomIn className="w-3 h-3 text-white drop-shadow" />
            </div>

            {/* Match sub-badge */}
            <span className="absolute bottom-0 inset-x-0 bg-slate-950/95 text-[6.5px] font-bold text-center py-0.2 text-emerald-300 tracking-wider pointer-events-none border-t border-slate-800">
              MATCH
            </span>
          </div>
        )}

        {/* ── Right Area: Metadata Rows per wireframe (name, Cam name, list, listTD/Trace) ── */}
        <div className="flex-1 min-w-0 pl-2.5 flex flex-col justify-between py-0.5">
          {/* Top Row: Category tag on left & Similarity Score on Top-Right */}
          <div className="flex items-center justify-between gap-1">
            <span className="text-[8px] uppercase tracking-wider text-slate-400 font-mono pl-4">
              {hasMatchedAvatar ? 'MATCH' : 'ALERT'}
            </span>
            <div
              className={`shrink-0 px-1.5 py-0.5 rounded font-black text-[10px] border shadow-sm ${badgeStyle}`}
              title={`Similarity: ${sim}%`}
            >
              {sim}%
            </div>
          </div>

          {/* Row 1: Name block */}
          <div
            className={`px-1.5 py-0.5 rounded border text-[11px] font-bold truncate flex items-center gap-1.5 ${nameBlock}`}
            title={info.name}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
            <span className="truncate">{info.name}</span>
          </div>

          {/* Row 2: Cam Name block */}
          <div
            className={`px-1.5 py-0.5 rounded border text-[10px] truncate flex items-center gap-1.5 ${camBlock}`}
            title={`Camera: ${info.cameraName}`}
          >
            <Camera className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="truncate font-medium">{info.cameraName}</span>
          </div>

          {/* Row 3: List block */}
          <div
            className={`px-1.5 py-0.5 rounded border text-[10px] truncate flex items-center gap-1.5 ${listBlock}`}
            title={`Watchlist: ${info.listName}`}
          >
            <Tag className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
            <span className="truncate font-medium">{info.listName}</span>
          </div>

          {/* Row 4: ListTD / Timestamp + Trace Button */}
          <div className="flex items-center justify-between gap-1 pt-0.5">
            <div
              className="flex items-center gap-1 text-[9px] text-slate-400 font-mono truncate"
              title={dateTimeLabel}
            >
              <Clock className="w-2.5 h-2.5 text-slate-500 shrink-0" />
              <span className="truncate">{info.timeFormatted}</span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTraceClick(event, info);
              }}
              title="Trace Person Movement"
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-bold transition-all shadow-sm shrink-0 ${traceBtn}`}
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
