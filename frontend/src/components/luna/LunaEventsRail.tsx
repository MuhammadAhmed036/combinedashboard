'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LunaEvent, LunaList, LunaHandler, ParsedLunaPersonInfo } from './types';
import { parseLunaEvent } from './lunaHelpers';
import { LunaEventCard } from './LunaEventCard';
import { FaceMovementTraceModal } from './FaceMovementTraceModal';
import { loadRuntimeConfig } from '@/lib/runtimeConfig';
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

function isLunaEvent(value: LunaEvent | LunaWebSocketPayload): value is LunaEvent {
  return 'event_id' in value || 'create_time' in value;
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
    if (f.minSimilarity > 0) p.set('top_similar_object_similarity__gte', f.minSimilarity.toFixed(2));
    if (f.maxSimilarity < 1.0) p.set('top_similar_object_similarity__lt', (f.maxSimilarity + 0.01).toFixed(2));
  }

  if (f.matchLabel.trim()) p.set('top_matching_candidates_label', f.matchLabel.trim());
  if (f.handlerIds.trim()) p.set('handler_ids', f.handlerIds.trim());
  if (f.sources.trim()) p.set('sources', f.sources.trim());
  if (f.faceIds.trim()) p.set('face_ids', f.faceIds.trim());
  // Gender filter: In Luna Platform, body detections use `apparent_gender: 1/0`.
  // When user filters Male/Female, pass apparent_gender so body detection events are matched.
  if (f.apparentGender !== '') {
    p.set('apparent_gender', f.apparentGender);
  } else if (f.gender !== '') {
    p.set('apparent_gender', f.gender);
  }

  // Age filter
  if (f.minApparentAge) {
    p.set('apparent_age__gte', f.minApparentAge);
  } else if (f.minAge) {
    p.set('apparent_age__gte', f.minAge);
  }

  if (f.maxApparentAge) {
    p.set('apparent_age__lt', f.maxApparentAge);
  } else if (f.maxAge) {
    p.set('apparent_age__lt', f.maxAge);
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
        className="flex w-full items-center justify-between py-3 text-left text-[12px] font-semibold text-slate-200 tracking-wide hover:text-cyan-400 transition-colors"
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
  return <span className="text-[10px] font-medium text-cyan-500 uppercase tracking-wider">{children}</span>;
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
          className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
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
        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
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
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
        />
        <span className="text-slate-600 text-[10px]">–</span>
        <input
          type={type || 'number'}
          placeholder={placeholder?.to || 'To'}
          value={toValue}
          onChange={(e) => onToChange(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Similarity, %</Label>
        <span className="text-[11px] text-cyan-400 font-mono font-semibold">
          {Math.round(min * 100)}% – {Math.round(max * 100)}%
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(min * 100)}
          onChange={(e) => onMinChange(Math.min(Number(e.target.value) / 100, max - 0.01))}
          placeholder="From"
          className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 text-center transition-colors"
        />
        <div className="flex-1 relative h-5 flex items-center">
          {/* Track */}
          <div className="absolute inset-x-0 h-1 bg-slate-700 rounded-full" />
          {/* Filled range */}
          <div
            className="absolute h-1 bg-cyan-500 rounded-full"
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
            className="absolute w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-slate-950 shadow-md pointer-events-none"
            style={{ left: `calc(${min * 100}% - 7px)` }}
          />
          <div
            className="absolute w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-slate-950 shadow-md pointer-events-none"
            style={{ left: `calc(${max * 100}% - 7px)` }}
          />
        </div>
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(max * 100)}
          onChange={(e) => onMaxChange(Math.max(Number(e.target.value) / 100, min + 0.01))}
          placeholder="To"
          className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 text-center transition-colors"
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
            className="absolute top-0 left-0 h-full w-[280px] z-30 flex flex-col bg-slate-950 border-r border-slate-800 shadow-2xl shadow-black/60"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 shrink-0 bg-slate-900/80">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                <span className="text-[13px] font-bold text-slate-100 tracking-wide">Filters</span>
                {countActiveFilters(filters) > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-cyan-600 text-white">
                    {countActiveFilters(filters)}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable filter body */}
            <div className="flex-1 overflow-y-auto px-4 py-1 space-y-0 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">

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
                  value={filters.apparentGender || filters.gender}
                  onChange={(v) => {
                    setFilter('apparentGender', v);
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
                        className={`py-1 rounded-md text-[10px] font-mono font-medium transition-all ${
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
                  value={filters.gender || filters.apparentGender}
                  onChange={(v) => {
                    setFilter('gender', v);
                    setFilter('apparentGender', v);
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
                  value={filters.apparentGender || filters.gender}
                  onChange={(v) => {
                    setFilter('apparentGender', v);
                    setFilter('gender', v);
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

            {/* Drawer footer — Apply / Reset */}
            <div className="shrink-0 px-4 py-3 border-t border-slate-800 bg-slate-900/80 flex items-center gap-2">
              <motion.button
                type="button"
                onClick={onApply}
                whileTap={{ scale: 0.97 }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[12px] transition-colors shadow-lg shadow-cyan-500/20"
              >
                <Filter className="w-3.5 h-3.5" />
                Apply Filters
              </motion.button>
              <motion.button
                type="button"
                onClick={onReset}
                whileTap={{ scale: 0.97 }}
                className="px-4 py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 font-semibold text-[12px] border border-rose-900/60 transition-colors"
              >
                Reset
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
        const [listsRes, handlersRes] = await Promise.allSettled([
          fetch('/api/luna/lists').then((r) => r.json()),
          fetch('/api/luna/handlers').then((r) => r.json()),
        ]);
        if (listsRes.status === 'fulfilled' && listsRes.value?.lists) setAvailableLists(listsRes.value.lists);
        if (handlersRes.status === 'fulfilled' && handlersRes.value?.handlers) setAvailableHandlers(handlersRes.value.handlers);
      } catch { /* silent */ }
    }
    loadMeta();
  }, []);

  // Fetch history
  const fetchHistoryEvents = useCallback(async (pageToFetch: number, currentFilters: FilterState, currentPageSize: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams(currentFilters, pageToFetch, currentPageSize);
      const res = await fetch(`/api/luna/events?${params.toString()}`);
      if (!res.ok) throw new Error(`Luna error ${res.status}`);
      const data: LunaEvent[] | LunaEventsResponse = await res.json();
      if (!Array.isArray(data) && data.offline) {
        setHistoryEvents([]);
        setHasMoreHistory(false);
        setError('Luna server offline');
        return;
      }
      const list: LunaEvent[] = Array.isArray(data) ? data : data.events || [];
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

  // WebSocket
  const connectWsRef = useRef<() => Promise<void>>(async () => {});

  const connectWs = useCallback(async () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    try {
      const config = await loadRuntimeConfig();
      const wsUrl = config.lunaWsUrl || (typeof window !== 'undefined' ? `ws://${window.location.hostname}:8092` : 'ws://localhost:8092');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => { setConnected(true); setError(null); };
      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data) as LunaEvent | LunaWebSocketPayload;
          const newEvent = payload.event || (isLunaEvent(payload) ? payload : null);
          if (!newEvent) return;
          const id = newEvent.event_id || newEvent.id;
          if (id) {
            setLiveEvents((prev) => {
              if (prev.some((e) => (e.event_id || e.id) === id)) return prev;
              return [newEvent, ...prev.slice(0, 49)];
            });
          }
        } catch { /* ignore */ }
      };
      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            connectWsRef.current();
          }
        }, 5000);
      };
    } catch { setConnected(false); }
  }, []);

  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (mode === 'live') {
      timeoutId = setTimeout(() => {
        connectWs();
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
    <div className="relative flex h-full w-full flex-col border-r border-slate-800 bg-slate-950 text-slate-200 select-none overflow-hidden">

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
      <div className="flex flex-col gap-2 px-3 py-3 border-b border-slate-800/80 bg-slate-900/60 shrink-0">

        {/* Title row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-slate-100 truncate">
              {mode === 'live' ? 'Luna Live Stream' : 'Luna History'}
            </h2>
            {mode === 'live' && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold shrink-0 ${
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

          {/* Mode tabs */}
          <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 shrink-0">
            {(['live', 'history'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                  mode === m ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'live' ? <Radio className="w-3 h-3" /> : <History className="w-3 h-3" />}
                <span className="capitalize">{m}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search + Filter button row */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Search name, cam, clothing..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-6 pr-6 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1.5 text-slate-500 hover:text-slate-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => setShowFilterPanel(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
              activeFilterCount > 0
                ? 'bg-cyan-950 text-cyan-300 border-cyan-700/60 ring-1 ring-cyan-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-cyan-600 text-[8px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </motion.button>
        </div>

        {/* Quick Similarity Filter Dots (Red: 0-59%, Green: 80-100%, Yellow: 60-79%) as requested in user diagram */}
        <div className="flex items-center justify-between px-0.5 pt-1 border-t border-slate-800/40">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-mono tracking-tight">Match Tier:</span>
            {/* Red Circle (0-59%) */}
            <button
              type="button"
              onClick={() => {
                const newTier = filters.similarityTier === 'red' ? 'all' : 'red';
                setFilter('similarityTier', newTier);
                if (mode === 'history') fetchHistoryEvents(1, { ...filters, similarityTier: newTier }, pageSize);
              }}
              className={`w-3.5 h-3.5 rounded-full bg-rose-500 transition-all ${
                filters.similarityTier === 'red'
                  ? 'ring-2 ring-white scale-125 shadow-md shadow-rose-500/80'
                  : 'opacity-70 hover:opacity-100 hover:scale-110'
              }`}
              title="Red: 0% - 59% (Low / Unmatched)"
            />
            {/* Green Circle (80-100%) */}
            <button
              type="button"
              onClick={() => {
                const newTier = filters.similarityTier === 'green' ? 'all' : 'green';
                setFilter('similarityTier', newTier);
                if (mode === 'history') fetchHistoryEvents(1, { ...filters, similarityTier: newTier }, pageSize);
              }}
              className={`w-3.5 h-3.5 rounded-full bg-emerald-500 transition-all ${
                filters.similarityTier === 'green'
                  ? 'ring-2 ring-white scale-125 shadow-md shadow-emerald-500/80'
                  : 'opacity-70 hover:opacity-100 hover:scale-110'
              }`}
              title="Green: 80% - 100% (High Match)"
            />
            {/* Yellow Circle (60-79%) */}
            <button
              type="button"
              onClick={() => {
                const newTier = filters.similarityTier === 'yellow' ? 'all' : 'yellow';
                setFilter('similarityTier', newTier);
                if (mode === 'history') fetchHistoryEvents(1, { ...filters, similarityTier: newTier }, pageSize);
              }}
              className={`w-3.5 h-3.5 rounded-full bg-amber-400 transition-all ${
                filters.similarityTier === 'yellow'
                  ? 'ring-2 ring-white scale-125 shadow-md shadow-amber-400/80'
                  : 'opacity-70 hover:opacity-100 hover:scale-110'
              }`}
              title="Yellow: 60% - 79% (Medium Match)"
            />
          </div>

          {filters.similarityTier !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setFilter('similarityTier', 'all');
                if (mode === 'history') fetchHistoryEvents(1, { ...filters, similarityTier: 'all' }, pageSize);
              }}
              className="text-[9px] text-cyan-400 hover:text-cyan-200 underline font-mono"
            >
              Reset Tier
            </button>
          ) : (
            <span className="text-[9px] text-slate-500 font-mono">All Tiers</span>
          )}
        </div>
      </div>

      {/* ── History pagination bar ────────────────────────────────────────── */}
      {mode === 'history' && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/60 bg-slate-950 shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <span>Page {currentPage}</span>
            {loading && <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-500" />}
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
      <div className="flex-1 overflow-y-auto overflow-x-visible p-2.5 space-y-3 min-h-0">
        {loading && historyEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-xs gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-cyan-500" />
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
                  className="text-[11px] text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
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
        onClose={() => setTraceModalOpen(false)}
        event={selectedEventForTrace}
        personInfo={selectedPersonForTrace}
      />
    </div>
  );

  function handleTraceClick(event: LunaEvent, info: ParsedLunaPersonInfo) {
    setSelectedEventForTrace(event);
    setSelectedPersonForTrace(info);
    setTraceModalOpen(true);
  }
};
