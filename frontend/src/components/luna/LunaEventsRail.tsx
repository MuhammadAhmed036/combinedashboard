'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LunaEvent, LunaList, LunaHandler, ParsedLunaPersonInfo } from './types';
import { parseLunaEvent } from './lunaHelpers';
import { LunaEventCard } from './LunaEventCard';
import { FaceMovementTraceModal } from './FaceMovementTraceModal';
import { loadRuntimeConfig } from '@/lib/runtimeConfig';
import {
  directFetchLunaEvents,
  directFetchLunaHandlers,
  directFetchLunaLists,
  directFetchLunaEvent,
  directFetchLunaFace,
} from '@/lib/lunaDirectClient';
import { useUIStore } from '@/lib/store/useUIStore';
import { useCustomizeWallStore } from '@/lib/store/useCustomizeWallStore';
import { useCameras } from '@/lib/hooks/useCameras';
import { CustomizeWallContent } from '@/components/command-wall/LeftRailContainer';
import {
  Radio,
  History,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Layers,
  Sparkles,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Filter,
  ArrowLeftRight,
  LayoutGrid,
} from 'lucide-react';

// ─── Filter State ──────────────────────────────────────────────────────────────
interface FilterState {
  sortOrder: 'desc' | 'asc';
  quickTime: string;
  startTime: string;
  endTime: string;
  similarityTier: 'all' | 'green' | 'yellow' | 'red';
  minSimilarity: number;
  maxSimilarity: number;
  matchLabel: string;
  handlerIds: string;
  sources: string;
  faceIds: string;
  gender: string;
  minAge: string;
  maxAge: string;
  liveness: string;
  masks: string;
  ethnicGroups: string;
  emotions: string;
  deepfake: string;
  apparentGender: string;
  minApparentAge: string;
  maxApparentAge: string;
  headwearStates: string;
  upperClothingColors: string;
  lowerGarmentTypes: string;
  sleeveLengths: string;
  backpackStates: string;
  cities: string;
  areas: string;
}

interface LunaEventsResponse {
  events?: LunaEvent[];
  offline?: boolean;
}

interface LunaWebSocketPayload {
  event?: LunaEvent;
  id?: string;
}

function isLunaEvent(value: any): value is LunaEvent {
  if (!value || typeof value !== 'object') return false;
  return 'event_id' in value || 'id' in value || 'create_time' in value || 'event-create-time' in value;
}

const DEFAULT_FILTERS: FilterState = {
  sortOrder: 'desc',
  quickTime: 'all',
  startTime: '',
  endTime: '',
  similarityTier: 'all',
  minSimilarity: 0.0,
  maxSimilarity: 1.0,
  matchLabel: '',
  handlerIds: '',
  sources: '',
  faceIds: '',
  gender: '',
  minAge: '',
  maxAge: '',
  liveness: '',
  masks: '',
  ethnicGroups: '',
  emotions: '',
  deepfake: '',
  apparentGender: '',
  minApparentAge: '',
  maxApparentAge: '',
  headwearStates: '',
  upperClothingColors: '',
  lowerGarmentTypes: '',
  sleeveLengths: '',
  backpackStates: '',
  cities: '',
  areas: '',
};

function buildParams(f: FilterState, page: number, pageSize: number): URLSearchParams {
  const p = new URLSearchParams();
  p.set('page', String(page));
  p.set('page_size', String(pageSize));
  p.set('order', f.sortOrder);

  if (f.similarityTier === 'green') {
    p.set('top_similar_object_similarity__gte', '0.75');
  } else if (f.similarityTier === 'yellow') {
    p.set('top_similar_object_similarity__gte', '0.50');
    p.set('top_similar_object_similarity__lt', '0.75');
  } else if (f.similarityTier === 'red') {
    p.set('top_similar_object_similarity__lt', '0.50');
  } else {
    if (f.minSimilarity > 0) p.set('top_similar_object_similarity__gte', parseFloat(f.minSimilarity.toFixed(2)).toString());
    if (f.maxSimilarity < 1.0) {
      p.set('top_similar_object_similarity__lte', parseFloat(f.maxSimilarity.toFixed(2)).toString());
    } else if (f.minSimilarity > 0) {
      // Matches Vision Lab's query format
      p.set('top_similar_object_similarity__lt', '1');
    }
  }

  if (f.matchLabel.trim()) p.set('top_matching_candidates_label', f.matchLabel.trim());
  if (f.handlerIds.trim()) p.set('handler_ids', f.handlerIds.trim());
  if (f.sources.trim()) p.set('sources', f.sources.trim());
  if (f.faceIds.trim()) p.set('face_ids', f.faceIds.trim());

  // Face Gender filter: In Luna Platform, face events use `gender: 0 (Female) / 1 (Male)`
  if (f.gender !== '') {
    p.set('gender', f.gender);
  }
  // Body Gender filter: In Luna Platform, body detections use `apparent_gender: 0 (Female) / 1 (Male)`
  if (f.apparentGender !== '') {
    p.set('apparent_gender', f.apparentGender);
  }

  // Face Age filter: In Luna Platform, face events use `age__gte` and `age__lt`
  if (f.minAge) {
    p.set('age__gte', f.minAge);
  }
  if (f.maxAge) {
    p.set('age__lt', f.maxAge);
  }

  // Body Age filter: In Luna Platform, body detections use `apparent_age__gte` and `apparent_age__lt`
  if (f.minApparentAge) {
    p.set('apparent_age__gte', f.minApparentAge);
  }
  if (f.maxApparentAge) {
    p.set('apparent_age__lt', f.maxApparentAge);
  }

  if (f.liveness !== '') p.set('liveness', f.liveness);
  if (f.masks !== '') p.set('masks', f.masks);
  if (f.ethnicGroups !== '') p.set('ethnic_groups', f.ethnicGroups);
  if (f.emotions !== '') p.set('emotions', f.emotions);
  if (f.deepfake !== '') p.set('deepfake', f.deepfake);
  if (f.headwearStates !== '') p.set('headwear_states', f.headwearStates);
  if (f.upperClothingColors.trim()) p.set('upper_clothing_colors', f.upperClothingColors.trim());
  if (f.lowerGarmentTypes !== '') p.set('lower_garment_types', f.lowerGarmentTypes);
  if (f.sleeveLengths !== '') p.set('sleeve_lengths', f.sleeveLengths);
  if (f.backpackStates !== '') p.set('backpack_states', f.backpackStates);
  if (f.cities.trim()) p.set('cities', f.cities.trim());
  if (f.areas.trim()) p.set('areas', f.areas.trim());

  const now = new Date();
  const offsets: Record<string, number> = {
    '1h': 3_600_000,
    '6h': 21_600_000,
    '12h': 43_200_000,
    '24h': 86_400_000,
    '3d': 259_200_000,
    '7d': 604_800_000,
    '30d': 2_592_000_000,
  };
  if (f.quickTime in offsets) {
    p.set('create_time__gte', new Date(now.getTime() - offsets[f.quickTime]).toISOString());
  } else if (f.quickTime === 'custom') {
    if (f.startTime) p.set('create_time__gte', new Date(f.startTime).toISOString());
    if (f.endTime) p.set('create_time__lt', new Date(f.endTime).toISOString());
  }

  return p;
}

// ─── Count active filters ──────────────────────────────────────────────────────
function countActiveFilters(f: FilterState): number {
  let n = 0;
  if (f.quickTime !== 'all') n++;
  if (f.similarityTier !== 'all' || f.minSimilarity > 0 || f.maxSimilarity < 1.0) n++;
  if (f.matchLabel) n++;
  if (f.handlerIds) n++;
  if (f.sources) n++;
  if (f.faceIds) n++;
  if (f.gender) n++;
  if (f.minAge || f.maxAge) n++;
  if (f.liveness) n++;
  if (f.masks) n++;
  if (f.ethnicGroups) n++;
  if (f.emotions) n++;
  if (f.deepfake) n++;
  if (f.apparentGender) n++;
  if (f.minApparentAge || f.maxApparentAge) n++;
  if (f.headwearStates) n++;
  if (f.upperClothingColors) n++;
  if (f.lowerGarmentTypes) n++;
  if (f.sleeveLengths) n++;
  if (f.backpackStates) n++;
  if (f.cities) n++;
  if (f.areas) n++;
  return n;
}

// ─── Collapsible Section ──────────────────────────────────────────────────────
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-800/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-3 text-left text-[12px] font-semibold text-slate-200 tracking-wide hover:text-white transition-colors"
      >
        <span>{title}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{children}</span>;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3 h-3 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}

function TextField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
      />
    </div>
  );
}

interface RangeFieldProps {
  label: string;
  fromValue: string;
  toValue: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  placeholder?: { from?: string; to?: string };
  type?: 'number' | 'text';
}

function RangeField({ label, fromValue, toValue, onFromChange, onToChange, placeholder, type }: RangeFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type={type || 'number'}
          placeholder={placeholder?.from || 'From'}
          value={fromValue}
          onChange={(e) => onFromChange(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
        />
        <span className="text-slate-600 text-[10px]">–</span>
        <input
          type={type || 'number'}
          placeholder={placeholder?.to || 'To'}
          value={toValue}
          onChange={(e) => onToChange(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
        />
      </div>
    </div>
  );
}

function SimilaritySlider({
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  min: number;
  max: number;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between">
        <Label>Similarity, %</Label>
        <span className="text-[10px] text-slate-200 font-mono font-semibold">
          {Math.round(min * 100)}% – {Math.round(max * 100)}%
        </span>
      </div>
      <div className="flex items-center gap-1.5 w-full">
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(min * 100)}
          onChange={(e) => onMinChange(Math.min(Number(e.target.value) / 100, max - 0.01))}
          placeholder="0"
          className="w-12 shrink-0 bg-slate-900 border border-slate-700 rounded-md px-1 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 text-center transition-colors font-mono"
        />
        <div className="flex-1 min-w-[50px] relative h-5 flex items-center">
          {/* Track */}
          <div className="absolute inset-x-0 h-1 bg-slate-700 rounded-full" />
          {/* Filled range */}
          <div
            className="absolute h-1 bg-blue-600 rounded-full"
            style={{ left: `${min * 100}%`, right: `${(1 - max) * 100}%` }}
          />
          {/* Min thumb */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={min}
            onChange={(e) => onMinChange(Math.min(parseFloat(e.target.value), max - 0.05))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
            style={{ zIndex: min > 0.9 ? 3 : 1 }}
          />
          {/* Max thumb */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={max}
            onChange={(e) => onMaxChange(Math.max(parseFloat(e.target.value), min + 0.05))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
            style={{ zIndex: 2 }}
          />
          {/* Thumb visuals */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-slate-950 shadow-md pointer-events-none"
            style={{ left: `calc(${min * 100}% - 7px)` }}
          />
          <div
            className="absolute w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-slate-950 shadow-md pointer-events-none"
            style={{ left: `calc(${max * 100}% - 7px)` }}
          />
        </div>
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(max * 100)}
          onChange={(e) => onMaxChange(Math.max(Number(e.target.value) / 100, min + 0.01))}
          placeholder="100"
          className="w-12 shrink-0 bg-slate-900 border border-slate-700 rounded-md px-1 py-1.5 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 text-center transition-colors font-mono"
        />
      </div>
    </div>
  );
}

// ─── Filter Panel (slide-in drawer) ───────────────────────────────────────────
function FilterPanel({
  open,
  onClose,
  filters,
  setFilter,
  availableHandlers,
  availableLists,
  onApply,
  onReset,
  pageSize,
  setPageSize,
}: {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(k: K, v: FilterState[K]) => void;
  availableHandlers: LunaHandler[];
  availableLists: LunaList[];
  onApply: () => void;
  onReset: () => void;
  pageSize: number;
  setPageSize: (n: number) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 z-20"
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
            className="absolute inset-0 z-30 flex flex-col w-full h-full bg-slate-950 border-r border-slate-800 shadow-2xl shadow-black/60 overflow-hidden"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 shrink-0 bg-slate-900/90">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center gap-1 px-1.5 py-1 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Back to events"
                >
                  <ChevronLeft className="w-4 h-4 shrink-0" />
                  <span className="text-[11px] font-semibold">Back</span>
                </button>
                <span className="text-slate-600">|</span>
                <div className="flex items-center gap-1.5 truncate">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[12px] font-bold text-slate-100 tracking-wide truncate">Filters</span>
                  {countActiveFilters(filters) > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#c01823] text-white shrink-0">
                      {countActiveFilters(filters)}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable filter body */}
            <div className="flex-1 overflow-y-auto px-3 py-1 space-y-0 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">

              {/* ── General ──────────────────────────────────────────────── */}
              <Section title="General" defaultOpen>
                {availableHandlers.length > 0 ? (
                  <SelectField
                    label="Source / Handler"
                    value={filters.handlerIds}
                    onChange={(v) => setFilter('handlerIds', v)}
                    options={[
                      { value: '', label: 'Select...' },
                      ...availableHandlers.map((h) => ({
                        value: h.handler_id,
                        label: h.description || h.handler_id.slice(0, 20),
                      })),
                    ]}
                  />
                ) : (
                  <TextField
                    label="Source / Handler ID"
                    placeholder="Camera name or UUID..."
                    value={filters.handlerIds}
                    onChange={(v) => setFilter('handlerIds', v)}
                  />
                )}

                {availableLists.length > 0 ? (
                  <SelectField
                    label="Watchlist / Match Label"
                    value={filters.matchLabel}
                    onChange={(v) => setFilter('matchLabel', v)}
                    options={[
                      { value: '', label: 'Select...' },
                      ...availableLists.map((l) => ({
                        value: l.user_data || l.list_id,
                        label: l.user_data || l.list_id.slice(0, 20),
                      })),
                    ]}
                  />
                ) : (
                  <TextField
                    label="Watchlist / Match Label"
                    placeholder="e.g. Blacklist, VIP..."
                    value={filters.matchLabel}
                    onChange={(v) => setFilter('matchLabel', v)}
                  />
                )}

                <SelectField
                  label="Gender"
                  value={filters.gender}
                  onChange={(v) => {
                    setFilter('gender', v);
                  }}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '1', label: 'Male' },
                    { value: '0', label: 'Female' },
                  ]}
                />

                <SimilaritySlider
                  min={filters.minSimilarity}
                  max={filters.maxSimilarity}
                  onMinChange={(v) => setFilter('minSimilarity', v)}
                  onMaxChange={(v) => setFilter('maxSimilarity', v)}
                />

                <div className="flex flex-col gap-1.5">
                  <Label>Time Range</Label>
                  <div className="grid grid-cols-4 gap-1">
                    {(['all', '1h', '6h', '12h', '24h', '3d', '7d', '30d'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFilter('quickTime', t)}
                        className={`py-1 px-0.5 rounded-md text-[9.5px] font-mono font-medium text-center truncate transition-all ${
                          filters.quickTime === t
                            ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-500/20'
                            : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                        }`}
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilter('quickTime', 'custom')}
                    className={`w-full py-1 rounded-md text-[10px] font-mono font-medium transition-all ${
                      filters.quickTime === 'custom'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    CUSTOM RANGE
                  </button>
                  {filters.quickTime === 'custom' && (
                    <div className="flex flex-col gap-2 mt-1 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] text-slate-500 uppercase">From</span>
                        <input
                          type="datetime-local"
                          value={filters.startTime}
                          onChange={(e) => setFilter('startTime', e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] text-slate-200"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] text-slate-500 uppercase">To</span>
                        <input
                          type="datetime-local"
                          value={filters.endTime}
                          onChange={(e) => setFilter('endTime', e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] text-slate-200"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <SelectField
                    label="Sort Order"
                    value={filters.sortOrder}
                    onChange={(v) => setFilter('sortOrder', v as 'desc' | 'asc')}
                    options={[
                      { value: 'desc', label: 'Newest First' },
                      { value: 'asc', label: 'Oldest First' },
                    ]}
                  />
                  <SelectField
                    label="Page Size"
                    value={String(pageSize)}
                    onChange={(v) => setPageSize(Number(v))}
                    options={[
                      { value: '10', label: '10 / page' },
                      { value: '20', label: '20 / page' },
                      { value: '50', label: '50 / page' },
                      { value: '100', label: '100 / page' },
                    ]}
                  />
                </div>

                <TextField
                  label="Face IDs (comma-sep)"
                  placeholder="uuid1,uuid2..."
                  value={filters.faceIds}
                  onChange={(v) => setFilter('faceIds', v)}
                />
                <TextField
                  label="Camera Source Name"
                  placeholder="e.g. cam-entrance..."
                  value={filters.sources}
                  onChange={(v) => setFilter('sources', v)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    label="City"
                    placeholder="e.g. Karachi"
                    value={filters.cities}
                    onChange={(v) => setFilter('cities', v)}
                  />
                  <TextField
                    label="Area"
                    placeholder="e.g. Defence"
                    value={filters.areas}
                    onChange={(v) => setFilter('areas', v)}
                  />
                </div>
              </Section>

              {/* ── Face attributes ───────────────────────────────────────── */}
              <Section title="Face Attributes & Properties">
                <SelectField
                  label="Face Gender"
                  value={filters.gender}
                  onChange={(v) => {
                    setFilter('gender', v);
                  }}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '1', label: 'Male' },
                    { value: '0', label: 'Female' },
                  ]}
                />
                <RangeField
                  label="Age"
                  fromValue={filters.minAge}
                  toValue={filters.maxAge}
                  onFromChange={(v) => setFilter('minAge', v)}
                  onToChange={(v) => setFilter('maxAge', v)}
                  placeholder={{ from: 'Min age', to: 'Max age' }}
                />
                <SelectField
                  label="Liveness"
                  value={filters.liveness}
                  onChange={(v) => setFilter('liveness', v)}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '1', label: 'Real person' },
                    { value: '0', label: 'Spoof / Fake' },
                    { value: '2', label: 'Unknown' },
                  ]}
                />
                <SelectField
                  label="Mask"
                  value={filters.masks}
                  onChange={(v) => setFilter('masks', v)}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '1', label: 'No mask' },
                    { value: '2', label: 'Medical mask' },
                    { value: '3', label: 'Face occluded' },
                  ]}
                />
                <SelectField
                  label="Ethnicity"
                  value={filters.ethnicGroups}
                  onChange={(v) => setFilter('ethnicGroups', v)}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '1', label: 'Asian' },
                    { value: '2', label: 'Caucasian' },
                    { value: '3', label: 'African' },
                    { value: '4', label: 'East Indian' },
                  ]}
                />
                <SelectField
                  label="Emotion"
                  value={filters.emotions}
                  onChange={(v) => setFilter('emotions', v)}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '1', label: 'Anger' },
                    { value: '2', label: 'Disgust' },
                    { value: '3', label: 'Fear' },
                    { value: '4', label: 'Happiness' },
                    { value: '5', label: 'Neutral' },
                    { value: '6', label: 'Sadness' },
                    { value: '7', label: 'Surprise' },
                  ]}
                />
                <SelectField
                  label="Deepfake Detection"
                  value={filters.deepfake}
                  onChange={(v) => setFilter('deepfake', v)}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '0', label: 'Real' },
                    { value: '1', label: 'Deepfake' },
                  ]}
                />
              </Section>

              {/* ── Body attributes ───────────────────────────────────────── */}
              <Section title="Body Attributes & Properties">
                <SelectField
                  label="Gender (Body)"
                  value={filters.apparentGender}
                  onChange={(v) => {
                    setFilter('apparentGender', v);
                  }}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '1', label: 'Male' },
                    { value: '0', label: 'Female' },
                  ]}
                />
                <RangeField
                  label="Apparent Age (Body)"
                  fromValue={filters.minApparentAge}
                  toValue={filters.maxApparentAge}
                  onFromChange={(v) => setFilter('minApparentAge', v)}
                  onToChange={(v) => setFilter('maxApparentAge', v)}
                  placeholder={{ from: 'Min age', to: 'Max age' }}
                />
                <SelectField
                  label="Headwear"
                  value={filters.headwearStates}
                  onChange={(v) => setFilter('headwearStates', v)}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '0', label: 'No headwear' },
                    { value: '1', label: 'Hat / Cap' },
                    { value: '2', label: 'Helmet' },
                  ]}
                />
                <SelectField
                  label="Sleeve Length"
                  value={filters.sleeveLengths}
                  onChange={(v) => setFilter('sleeveLengths', v)}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: 'short', label: 'Short sleeve' },
                    { value: 'long', label: 'Long sleeve' },
                  ]}
                />
                <TextField
                  label="Upper Clothing Colors"
                  placeholder="e.g. black,white,red"
                  value={filters.upperClothingColors}
                  onChange={(v) => setFilter('upperClothingColors', v)}
                />
                <SelectField
                  label="Lower Garment Type"
                  value={filters.lowerGarmentTypes}
                  onChange={(v) => setFilter('lowerGarmentTypes', v)}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: 'trousers', label: 'Trousers' },
                    { value: 'skirt', label: 'Skirt' },
                    { value: 'shorts', label: 'Shorts' },
                  ]}
                />
                <SelectField
                  label="Backpack"
                  value={filters.backpackStates}
                  onChange={(v) => setFilter('backpackStates', v)}
                  options={[
                    { value: '', label: 'Select...' },
                    { value: '0', label: 'No backpack' },
                    { value: '1', label: 'Wearing backpack' },
                  ]}
                />
              </Section>
            </div>

            {/* Drawer footer — Back / Reset / Apply */}
            <div className="shrink-0 px-2.5 py-2.5 border-t border-slate-800 bg-slate-900/90 flex items-center gap-1.5">
              <motion.button
                type="button"
                onClick={onClose}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] border border-slate-700 transition-colors shrink-0"
                title="Go back to events"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </motion.button>
              <motion.button
                type="button"
                onClick={onReset}
                whileTap={{ scale: 0.95 }}
                className="px-2.5 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 font-semibold text-[11px] border border-rose-900/60 transition-colors shrink-0"
                title="Reset all filters"
              >
                Reset
              </motion.button>
              <motion.button
                type="button"
                onClick={onApply}
                whileTap={{ scale: 0.95 }}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold text-[11px] transition-colors shadow-sm truncate"
              >
                <Filter className="w-3 h-3 shrink-0" />
                <span className="truncate">Apply</span>
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export const LunaEventsRail: React.FC = () => {
  const isCustomizingWall = useCustomizeWallStore((s) => s.isCustomizingWall);
  const toggleCustomizingWall = useCustomizeWallStore((s) => s.toggleCustomizingWall);
  const isTraceModalOpen = useCustomizeWallStore((s) => s.isTraceModalOpen);
  const { data: cameras } = useCameras();
  const [mode, setMode] = useState<'live' | 'history'>('live');
  const [liveEvents, setLiveEvents] = useState<LunaEvent[]>([]);
  const [historyEvents, setHistoryEvents] = useState<LunaEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [availableLists, setAvailableLists] = useState<LunaList[]>([]);
  const [availableHandlers, setAvailableHandlers] = useState<LunaHandler[]>([]);

  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [selectedEventForTrace, setSelectedEventForTrace] = useState<LunaEvent | null>(null);
  const [selectedPersonForTrace, setSelectedPersonForTrace] = useState<ParsedLunaPersonInfo | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Load dropdown metadata once
  useEffect(() => {
    async function loadMeta() {
      try {
        const [lists, handlers] = await Promise.allSettled([
          directFetchLunaLists(),
          directFetchLunaHandlers(),
        ]);
        if (lists.status === 'fulfilled') setAvailableLists(lists.value);
        if (handlers.status === 'fulfilled') setAvailableHandlers(handlers.value);
      } catch { /* silent */ }
    }
    loadMeta();
  }, []);

  // Fetch history directly from VisionLabs Luna LP5
  const fetchHistoryEvents = useCallback(async (pageToFetch: number, currentFilters: FilterState, currentPageSize: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams(currentFilters, pageToFetch, currentPageSize);
      const { events: list } = await directFetchLunaEvents(params);
      setHistoryEvents(list);
      setCurrentPage(pageToFetch);
      setHasMoreHistory(list.length >= currentPageSize);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load history events');
      setHistoryEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket - Target VisionLabs LUNA Platform official /6/ws
  const connectWsRef = useRef<() => Promise<void>>(async () => {});

  const connectWs = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    try {
      const config = await loadRuntimeConfig().catch(() => null);

      // VisionLabs Official WebSocket Endpoint
      // Primary: direct connection configured via environment / runtime-config
      const directLunaWs =
        process.env.NEXT_PUBLIC_LUNA_WS_URL ||
        config?.lunaWsUrl ||
        "";

      // Fallback proxy using configured WS port
      const wsPort = config?.lunaWsPort || process.env.NEXT_PUBLIC_LUNA_WS_PORT || "";
      const proxyWs =
        typeof window !== 'undefined' && wsPort
          ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:${wsPort}`
          : '';

      let currentWsUrl = directLunaWs || proxyWs;
      if (!currentWsUrl) {
        console.warn('[Luna WS] Luna WebSocket URL/port is not configured in environment');
        return;
      }

      console.log('[Luna WS] Initializing VisionLabs WebSocket:', currentWsUrl);

      let ws: WebSocket;
      try {
        ws = new WebSocket(currentWsUrl);
      } catch (err) {
        if (proxyWs && currentWsUrl !== proxyWs) {
          console.warn('[Luna WS] Direct connection instantiation failed, using proxy fallback:', err);
          currentWsUrl = proxyWs;
          ws = new WebSocket(currentWsUrl);
        } else {
          throw err;
        }
      }

      wsRef.current = ws;

      const scheduleReconnect = () => {
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            connectWsRef.current();
          }
        }, 5000);
      };

      ws.onopen = () => {
        console.log('[Luna WS] Connected to VisionLabs WebSocket at:', currentWsUrl);
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (evt) => {
        try {
          const raw = JSON.parse(evt.data);
          console.log('[Luna WS] Real-time Event Received:', raw);

          // Support both direct VisionLabs event JSON and wrapped payload format
          const payload = raw.event || (isLunaEvent(raw) ? raw : null);
          if (!payload) return;

          const id = payload.event_id || payload.id;
          const createTime =
            payload['event-create-time'] ||
            payload.create_time ||
            payload.event_create_time ||
            new Date().toISOString();

          const newEvent: LunaEvent = {
            ...payload,
            event_id: id || `luna-ws-${Date.now()}`,
            create_time: createTime,
          };

          setLiveEvents((prev) => {
            const eventKey = newEvent.event_id || newEvent.id;
            if (eventKey && prev.some((e) => (e.event_id || e.id) === eventKey)) {
              return prev;
            }
            return [newEvent, ...prev.slice(0, 49)]; // Keep last 50 live events
          });

          // Fetch full event details from Luna API to retrieve detected face sample crop & camera frame
          if (id) {
            directFetchLunaEvent(id)
              .then((fullEvt) => {
                if (fullEvt) {
                  setLiveEvents((prev) =>
                    prev.map((item) =>
                      (item.event_id || item.id) === id
                        ? { ...item, ...fullEvt, event_id: id }
                        : item
                    )
                  );
                }
              })
              .catch(() => {});
          }

          const matchFaceId =
            payload.top_match?.face_id ||
            payload.match_result?.[0]?.candidates?.[0]?.face?.face_id ||
            (payload as any).face_id;

          if (matchFaceId) {
            directFetchLunaFace(matchFaceId)
              .then((faceData) => {
                if (faceData?.avatar) {
                  setLiveEvents((prev) =>
                    prev.map((item) => {
                      if ((item.event_id || item.id) === id) {
                        const updated = { ...item };
                        if (updated.top_match) {
                          (updated.top_match as any).avatar = faceData.avatar;
                        }
                        (updated as any).avatar = faceData.avatar;
                        return updated;
                      }
                      return item;
                    })
                  );
                }
              })
              .catch(() => {});
          }
        } catch (err) {
          console.error('[Luna WS] Failed to parse message:', err);
        }
      };

      ws.onerror = (err) => {
        console.warn('[Luna WS] WebSocket connection error on', currentWsUrl, err);
        // If direct connection errored (e.g. browser rejected URL basic auth), fallback to proxy
        if (currentWsUrl !== proxyWs) {
          console.log('[Luna WS] Switching to proxy fallback tunnel...');
          try {
            const fallbackWs = new WebSocket(proxyWs);
            wsRef.current = fallbackWs;
            fallbackWs.onopen = () => {
              console.log('[Luna WS] Connected to VisionLabs via proxy fallback!');
              setConnected(true);
              setError(null);
            };
            fallbackWs.onmessage = ws.onmessage;
            fallbackWs.onerror = () => setConnected(false);
            fallbackWs.onclose = () => {
              setConnected(false);
              scheduleReconnect();
            };
            return;
          } catch {
            setConnected(false);
          }
        }
        setConnected(false);
      };

      ws.onclose = () => {
        console.log('[Luna WS] WebSocket Connection Closed');
        setConnected(false);
        scheduleReconnect();
      };
    } catch (e) {
      console.error('[Luna WS] Init failed:', e);
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (mode === 'live') {
      timeoutId = setTimeout(() => {
        connectWs();
        // Seed liveEvents with latest events from LP5 so user immediately sees recent results
        directFetchLunaEvents(buildParams(DEFAULT_FILTERS, 1, 30))
          .then(({ events }) => {
            if (events && events.length > 0) {
              setLiveEvents((prev) => (prev.length === 0 ? events : prev));
            }
          })
          .catch(() => {});
      }, 0);
    } else {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      timeoutId = setTimeout(() => {
        setConnected(false);
        fetchHistoryEvents(1, filters, pageSize);
      }, 0);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleApply = useCallback(() => {
    setMode('history');
    setCurrentPage(1);
    fetchHistoryEvents(1, filters, pageSize);
    setShowFilterPanel(false);
  }, [fetchHistoryEvents, filters, pageSize]);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
    if (mode === 'history') fetchHistoryEvents(1, DEFAULT_FILTERS, pageSize);
  }, [fetchHistoryEvents, mode, pageSize]);

  const currentEvents = mode === 'live' ? liveEvents : historyEvents;
  const displayedEvents = useMemo(() => {
    if (!searchQuery.trim()) return currentEvents;
    const q = searchQuery.toLowerCase();
    return currentEvents.filter((ev) => {
      const info = parseLunaEvent(ev);
      return (
        info.name.toLowerCase().includes(q) ||
        info.cameraName.toLowerCase().includes(q) ||
        info.listName.toLowerCase().includes(q) ||
        (info.attributesSummary || '').toLowerCase().includes(q)
      );
    });
  }, [currentEvents, searchQuery]);

  const activeFilterCount = countActiveFilters(filters);

  return (
    <div className="relative z-30 flex h-full w-full min-h-0 min-w-0 overflow-visible">
      {/* ── Seamless Animated Content Switcher ──────────────────────────────── */}
      <div className="size-full overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {isCustomizingWall ? (
            <motion.div
              key="customize-rail"
              className="size-full"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              <CustomizeWallContent cameras={cameras} />
            </motion.div>
          ) : (
            <motion.div
              key="luna-rail"
              className="relative flex h-full w-full flex-col border-r border-slate-800 bg-slate-950 text-slate-200 select-none"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >

      {/* Filter Panel Overlay */}
      <FilterPanel
        open={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        filters={filters}
        setFilter={setFilter}
        availableHandlers={availableHandlers}
        availableLists={availableLists}
        onApply={handleApply}
        onReset={handleReset}
        pageSize={pageSize}
        setPageSize={setPageSize}
      />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 pl-3 pr-4 py-3 border-b border-slate-800/80 bg-slate-900/60 shrink-0 overflow-visible">

        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-slate-100 truncate">
              {isCustomizingWall ? 'Customize Wall' : mode === 'live' ? 'Luna Live Stream' : 'Luna History'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {!isCustomizingWall && mode === 'live' && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold shrink-0 ${
                  connected
                    ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                    : 'bg-amber-950/70 text-amber-400 border border-amber-800/60'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {connected ? `LIVE ${liveEvents.length}/50` : 'STANDBY'}
              </span>
            )}
          </div>
        </div>

        {/* Live / History Mode Tabs + Filters Button Row (Clean enterprise tabs) */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          {/* Live / History Pill Switch */}
          <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 shrink-0">
            {(['live', 'history'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                  mode === m ? 'bg-[#c01823] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'live' ? <Radio className="w-3 h-3" /> : <History className="w-3 h-3" />}
                <span className="capitalize">{m}</span>
              </button>
            ))}
          </div>

          {/* Filters Button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => setShowFilterPanel(true)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11px] font-semibold transition-colors shrink-0 mr-2 cursor-pointer ${
              activeFilterCount > 0
                ? 'bg-slate-800 text-white border-slate-600'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#c01823] text-[8px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </motion.button>
        </div>
      </div>

      {/* ── History pagination bar ────────────────────────────────────────── */}
      {mode === 'history' && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/60 bg-slate-950 shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <span>Page {currentPage}</span>
            {loading && <RefreshCw className="w-2.5 h-2.5 animate-spin text-slate-400" />}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={() => fetchHistoryEvents(currentPage - 1, filters, pageSize)}
              className="p-1 rounded-md border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              disabled={!hasMoreHistory || loading}
              onClick={() => fetchHistoryEvents(currentPage + 1, filters, pageSize)}
              className="p-1 rounded-md border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── Events list ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-visible p-2 pt-3.5 space-y-3.5 min-h-0">
        {loading && historyEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-xs gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
            <span>Loading Luna events...</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[11px]">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {!loading && displayedEvents.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-xs text-center px-4 gap-3">
            <Layers className="w-8 h-8 text-slate-700" />
            {mode === 'live' ? (
              <>
                <span className="text-slate-400">Waiting for live events…</span>
                <span className="text-slate-600 text-[10px]">WebSocket streaming from Luna</span>
              </>
            ) : (
              <>
                <span className="text-slate-400">No events found</span>
                <button
                  onClick={() => { setFilters(DEFAULT_FILTERS); fetchHistoryEvents(1, DEFAULT_FILTERS, pageSize); }}
                  className="text-[11px] text-blue-400 underline underline-offset-2 hover:text-blue-300"
                >
                  Clear filters & reload
                </button>
              </>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          {displayedEvents.map((ev, index) => (
            <motion.div
              key={ev.event_id || `evt-${index}`}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18, delay: index < 5 ? index * 0.04 : 0 }}
            >
              <LunaEventCard event={ev} onTraceClick={handleTraceClick} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Trace modal */}
      <FaceMovementTraceModal
        isOpen={traceModalOpen}
        onClose={() => {
          setTraceModalOpen(false);
          useCustomizeWallStore.getState().setIsTraceModalOpen(false);
        }}
        event={selectedEventForTrace}
        personInfo={selectedPersonForTrace}
      />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Floating Tactical Switch Button on Rail Edge (<->) ───────────────── */}
      {!traceModalOpen && !isTraceModalOpen && (
        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleCustomizingWall();
          }}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.92 }}
          style={{
            position: 'absolute',
            right: '-14px',
            top: '40%',
            zIndex: 40,
          }}
          className="flex size-7 items-center justify-center rounded-full bg-[#111318] border border-slate-700 text-slate-300 shadow-md hover:border-slate-500 hover:text-white hover:bg-[#181b23] cursor-pointer pointer-events-auto transition-colors"
          title={isCustomizingWall ? 'Switch back to Luna Stream' : 'Switch to Customize Wall'}
          aria-label="Toggle Customize Wall Panel"
        >
          <motion.div
            animate={{ rotate: isCustomizingWall ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="flex items-center justify-center"
          >
            {isCustomizingWall ? (
              <Radio className="size-3.5 text-emerald-400" />
            ) : (
              <ArrowLeftRight className="size-3.5 text-slate-300" />
            )}
          </motion.div>
        </motion.button>
      )}
    </div>
  );

  function handleTraceClick(event: LunaEvent, info: ParsedLunaPersonInfo) {
    setSelectedEventForTrace(event);
    setSelectedPersonForTrace(info);
    setTraceModalOpen(true);
    useCustomizeWallStore.getState().setIsTraceModalOpen(true);
  }
};
