'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LunaEvent, MovementTracePoint, ParsedLunaPersonInfo } from './types';
import { resolveLunaSampleUrl } from './lunaHelpers';
import { directFetchLunaEvents } from '@/lib/lunaDirectClient';
import { useCameraLocations } from '@/lib/hooks/useCameraLocations';
import { useCustomizeWallStore } from '@/lib/store/useCustomizeWallStore';
import { FaceMovementTraceMapLoader } from './FaceMovementTraceMapLoader';
import {
  X,
  Navigation,
  Clock,
  Camera,
  MapPin,
  Filter,
  Download,
  Loader2,
  AlertCircle,
  User,
  Calendar,
  Check,
  ChevronRight,
  ArrowDown,
  Layers,
  Sparkles,
} from 'lucide-react';

interface FaceMovementTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: LunaEvent | null;
  personInfo: ParsedLunaPersonInfo | null;
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export const FaceMovementTraceModal: React.FC<FaceMovementTraceModalProps> = ({
  isOpen,
  onClose,
  event,
  personInfo,
}) => {
  const { data: registryCameras } = useCameraLocations();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracePoints, setTracePoints] = useState<MovementTracePoint[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [minSimilarity, setMinSimilarity] = useState<number>(0.5);
  // Default to Earliest First (A→Z) so the operator sees the chronological journey starting at #1
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [timePreset, setTimePreset] = useState<'1h' | '6h' | '24h' | '7d' | 'custom'>('24h');
  const [isMapMaximized, setIsMapMaximized] = useState(false);
  const [mounted, setMounted] = useState(false);
  const setIsTraceModalOpen = useCustomizeWallStore((s) => s.setIsTraceModalOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsTraceModalOpen(isOpen);
    return () => {
      setIsTraceModalOpen(false);
    };
  }, [isOpen, setIsTraceModalOpen]);

  // Start Date/Time and End Date/Time states (default to 24h past)
  const [startTime, setStartTime] = useState<string>(() => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return toDatetimeLocal(past);
  });
  const [endTime, setEndTime] = useState<string>(() => {
    return toDatetimeLocal(new Date());
  });

  // Fast camera coordinates lookup map from registry
  const cameraCoordsMap = useMemo(() => {
    const map = new Map<string, { latitude: number; longitude: number }>();
    (registryCameras ?? []).forEach((c) => {
      if (typeof c.latitude === 'number' && typeof c.longitude === 'number') {
        map.set(c.cameraId.toLowerCase().trim(), { latitude: c.latitude, longitude: c.longitude });
        map.set(c.cameraName.toLowerCase().trim(), { latitude: c.latitude, longitude: c.longitude });
      }
    });
    return map;
  }, [registryCameras]);

  // Stable coordinate resolver: Direct Geo -> Registry exact -> Keyword match -> Stable Islamabad Hash
  const resolvePointCoordinates = useCallback(
    (
      cameraName: string,
      geoPosition?: { latitude?: number; longitude?: number }
    ): { latitude: number; longitude: number } => {
      // 1. Direct from event geo_position if provided
      if (typeof geoPosition?.latitude === 'number' && typeof geoPosition?.longitude === 'number') {
        return { latitude: geoPosition.latitude, longitude: geoPosition.longitude };
      }

      // 2. Direct match in camera registry
      const lower = cameraName.toLowerCase().trim();
      if (cameraCoordsMap.has(lower)) {
        return cameraCoordsMap.get(lower)!;
      }

      // 3. Keyword / substring match
      for (const [key, coords] of cameraCoordsMap.entries()) {
        if (lower.includes(key) || key.includes(lower)) {
          return coords;
        }
      }

      // 4. Stable deterministic location inside Islamabad surveillance bounds
      let hash = 0;
      const seed = cameraName.toLowerCase().trim();
      for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
      }
      const offsetLat = (((hash % 1000) / 1000) - 0.5) * 0.02;
      const offsetLng = ((((hash >> 8) % 1000) / 1000) - 0.5) * 0.02;

      return {
        latitude: 33.6844 + offsetLat,
        longitude: 73.0479 + offsetLng,
      };
    },
    [cameraCoordsMap]
  );

  const fetchTraceHistory = useCallback(
    async (customStart?: string, customEnd?: string, customOrder?: 'asc' | 'desc') => {
      if (!personInfo?.faceId) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const activeOrder = customOrder ?? sortOrder;
        const rangeStart = customStart ?? startTime;
        const rangeEnd = customEnd ?? endTime;

        const startDate = rangeStart ? new Date(rangeStart) : null;
        const endDate = rangeEnd ? new Date(rangeEnd) : null;

        const params = new URLSearchParams();
        params.append('top_similar_object_ids', personInfo.faceId);
        params.append('top_similar_object_similarity__gte', minSimilarity.toFixed(2));
        params.append('order', activeOrder);
        params.append('page_size', '100');

        if (startDate && !isNaN(startDate.getTime())) {
          params.append('create_time__gte', startDate.toISOString());
        }

        if (endDate && !isNaN(endDate.getTime())) {
          // Use create_time__lt for LP5 standard filter
          params.append('create_time__lt', endDate.toISOString());
        }

        const { events } = await directFetchLunaEvents(params);

        // Strict client-side filter to guarantee 100% exact time range match
        const filteredEvents = events.filter((item) => {
          const ev = item.event || item;
          if (!ev.create_time) return true;
          const evTime = new Date(ev.create_time).getTime();
          if (isNaN(evTime)) return true;
          if (startDate && evTime < startDate.getTime()) return false;
          if (endDate && evTime > endDate.getTime()) return false;
          return true;
        });

        const points: MovementTracePoint[] = filteredEvents.map((item, index) => {
          const ev = item.event || item;
          const sampleId =
            ev.body_detections?.[0]?.image_origin ||
            ev.face_detections?.[0]?.sample_id ||
            ev.detections?.[0]?.sample_id ||
            ev.face_detections?.[0]?.samples?.face?.url ||
            ev.detections?.[0]?.samples?.face?.url;

          let sim = 0;
          if (ev.top_match) {
            sim = ev.top_match.similarity ?? ev.top_match.score ?? 0;
          } else if (ev.matches?.[0]?.candidates?.[0]) {
            sim = ev.matches[0].candidates[0].similarity || 0;
          } else {
            sim = 1.0;
          }

          const camName = ev.source || (ev.handler_id ? `Handler ${ev.handler_id.slice(0, 8)}` : 'Surveillance Cam');
          const coords = resolvePointCoordinates(camName, ev.location?.geo_position);

          return {
            id: ev.event_id || `trace-${index}`,
            timestamp: ev.create_time || new Date().toISOString(),
            camera: camName,
            area: ev.location?.area || ev.location?.city || 'Zone',
            similarity: Math.round(sim * 100),
            sampleUrl: resolveLunaSampleUrl(sampleId),
            avatarUrl: personInfo.avatarUrl,
            faceId: personInfo.faceId,
            latitude: coords.latitude,
            longitude: coords.longitude,
          };
        });

        // If no events found in range, fall back to initial detection event if it fits
        if (points.length === 0 && personInfo) {
          const initTime = new Date(personInfo.timestamp).getTime();
          const inRange =
            (!startDate || initTime >= startDate.getTime()) &&
            (!endDate || initTime <= endDate.getTime());

          if (inRange) {
            const coords = resolvePointCoordinates(personInfo.cameraName, undefined);
            points.push({
              id: event?.event_id || 'initial-point',
              timestamp: personInfo.timestamp,
              camera: personInfo.cameraName,
              area: 'Detected Location',
              similarity: personInfo.similarity,
              sampleUrl: personInfo.sampleUrl,
              avatarUrl: personInfo.avatarUrl,
              faceId: personInfo.faceId,
              latitude: coords.latitude,
              longitude: coords.longitude,
            });
          }
        }

        setTracePoints(points);
        if (points.length > 0) {
          setSelectedPointId(points[0].id);
        }
      } catch (err: unknown) {
        console.warn('[FaceMovementTrace] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load movement trace');
      } finally {
        setLoading(false);
      }
    },
    [personInfo, minSimilarity, sortOrder, startTime, endTime, resolvePointCoordinates, event]
  );

  // Quick preset selector with EXACT time computation
  const handlePresetSelect = (preset: '1h' | '6h' | '24h' | '7d') => {
    setTimePreset(preset);
    const now = new Date();
    let past = new Date();

    if (preset === '1h') {
      past = new Date(now.getTime() - 60 * 60 * 1000);
    } else if (preset === '6h') {
      past = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    } else if (preset === '24h') {
      past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (preset === '7d') {
      past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const sStr = toDatetimeLocal(past);
    const eStr = toDatetimeLocal(now);

    setStartTime(sStr);
    setEndTime(eStr);
    fetchTraceHistory(sStr, eStr);
  };

  // User clicked Apply button (Guaranteed exact hit)
  const handleApplyFilter = () => {
    fetchTraceHistory(startTime, endTime);
  };

  // Initial load
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (isOpen && personInfo) {
      timeoutId = setTimeout(() => {
        fetchTraceHistory();
      }, 0);
    } else {
      timeoutId = setTimeout(() => {
        setTracePoints([]);
        setError(null);
        setSelectedPointId(null);
        setIsMapMaximized(false);
      }, 0);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isOpen, personInfo, fetchTraceHistory]);

  if (!isOpen || !personInfo) return null;

  const totalDetections = tracePoints.length;
  const uniqueCameras = new Set(tracePoints.map((p) => p.camera)).size;

  // Chronological journey bounds (Earliest and Latest timestamps)
  const timestamps = tracePoints.map((p) => new Date(p.timestamp).getTime()).filter((t) => !isNaN(t));
  const minTime = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const totalJourneyDuration = minTime && maxTime && maxTime > minTime ? formatDuration(maxTime - minTime) : null;

  const exportTraceCSV = () => {
    const headers = ['Sequence', 'Timestamp', 'Camera', 'Area', 'Similarity', 'Latitude', 'Longitude', 'SampleUrl'];
    const rows = tracePoints.map((p, idx) => [
      idx + 1,
      `"${p.timestamp}"`,
      `"${p.camera}"`,
      `"${p.area}"`,
      `${p.similarity}%`,
      p.latitude ?? '',
      p.longitude ?? '',
      `"${p.sampleUrl || ''}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `trace_${personInfo.name.replace(/\s+/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="relative flex flex-col w-full max-w-[1580px] h-[94vh] max-h-[940px] bg-[#090d16] border border-slate-800 rounded-xl shadow-2xl overflow-hidden text-slate-200">
        {/* Top Header (Clean Enterprise Navbar - No Gradients) */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[#0c1220]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-blue-400">
              <Navigation className="w-4 h-4 rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Person Movement Trace</h2>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-xs font-mono font-medium">
                  {personInfo.name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
                  List: {personInfo.listName}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Surveillance waypoint vectors, chronological path, and offline GIS intelligence.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportTraceCSV}
              disabled={tracePoints.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-200 border border-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Identity & Sighting Metrics Bar (Enterprise Flat Tiles) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-2.5 bg-[#0b0f19] border-b border-slate-800 text-xs shrink-0">
          {/* Target Profile Card */}
          <div className="flex items-center gap-2.5 col-span-2 md:col-span-1">
            <div className="relative w-10 h-10 rounded-lg border border-slate-700 bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center">
              {personInfo.avatarUrl || personInfo.sampleUrl ? (
                <img
                  src={personInfo.avatarUrl || personInfo.sampleUrl!}
                  alt={personInfo.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-5 h-5 text-slate-600" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-white truncate text-xs">{personInfo.name}</div>
              <div className="text-[10px] text-blue-400 font-mono font-semibold">Match: {personInfo.similarity}%</div>
            </div>
          </div>

          {/* Metric 1: Total Sightings */}
          <div className="flex flex-col justify-center px-4 border-l border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Total Sightings</span>
            <span className="text-base font-bold text-slate-100 font-mono">{totalDetections}</span>
          </div>

          {/* Metric 2: Cameras Visited */}
          <div className="flex flex-col justify-center px-4 border-l border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Nodes Visited</span>
            <span className="text-base font-bold text-emerald-400 font-mono">{uniqueCameras} Cameras</span>
          </div>

          {/* Metric 3: First Seen (Origin) */}
          <div className="flex flex-col justify-center px-4 border-l border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Origin Time</span>
            <span className="text-xs text-slate-200 font-mono truncate">
              {minTime ? new Date(minTime).toLocaleTimeString() : 'N/A'}
            </span>
          </div>

          {/* Metric 4: Active Span */}
          <div className="flex flex-col justify-center px-4 border-l border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Active Span</span>
            <span className="text-xs text-amber-400 font-mono font-semibold truncate">
              {totalJourneyDuration ? totalJourneyDuration : 'Single Event'}
            </span>
          </div>
        </div>

        {/* Date / Time Filter Bar & Action Controls (Enterprise Clean Form) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-[#0e1422] border-b border-slate-800 text-xs shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Quick Presets Toggle Group */}
            <div className="flex items-center gap-1.5 text-slate-400">
              <Filter className="w-3.5 h-3.5" />
              <span className="font-medium text-slate-300">Preset:</span>
            </div>
            <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
              {(['1h', '6h', '24h', '7d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => handlePresetSelect(r)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    timePreset === r
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Custom Exact Date/Time Inputs */}
            <div className="flex items-center gap-2 pl-3 border-l border-slate-800 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] text-slate-400">From:</span>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setTimePreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">To:</span>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setTimePreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Exact Hit Apply Button (Solid enterprise blue) */}
              <button
                type="button"
                onClick={handleApplyFilter}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow transition-colors active:scale-95 disabled:opacity-40 cursor-pointer"
                title="Apply exact time range filter"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Apply</span>
              </button>
            </div>

            {/* Min Similarity Slider */}
            <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
              <span className="text-slate-400 font-medium">Min Match:</span>
              <input
                type="range"
                min="0.3"
                max="0.95"
                step="0.05"
                value={minSimilarity}
                onChange={(e) => setMinSimilarity(parseFloat(e.target.value))}
                className="w-20 accent-blue-500 cursor-pointer"
              />
              <span className="font-mono text-blue-400 font-bold">{Math.round(minSimilarity * 100)}%</span>
            </div>
          </div>

          {/* Chronology Order Selector */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Order:</span>
            <button
              onClick={() => {
                const nextOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                setSortOrder(nextOrder);
                setTracePoints((prev) => [...prev].reverse());
              }}
              className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 font-mono transition-colors cursor-pointer"
              title="Toggle chronological sorting"
            >
              {sortOrder === 'asc' ? 'Earliest First (Start ➔ Latest)' : 'Latest First (Latest ➔ Start)'}
            </button>
          </div>
        </div>

        {/* Main Content Body: Split Layout (Sightings Sequence + Trajectory Map) */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Column: Sighting Nodes Timeline (Collapsible when map is maximized) */}
          {!isMapMaximized && (
            <div className="w-full lg:w-[450px] xl:w-[480px] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-[#090d16] overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Sightings Sequence</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-mono font-bold text-slate-300">
                  {tracePoints.length} Detections
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loading && (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2.5">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                    <span className="text-xs font-mono">Retrieving surveillance points from safe city database...</span>
                  </div>
                )}

                {error && !loading && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800/80 text-red-300 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}

                {!loading && tracePoints.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2 text-center">
                    <Navigation className="w-8 h-8 text-slate-600" />
                    <p className="text-xs">No sightings recorded for this face in the selected time range.</p>
                  </div>
                )}

                {!loading && tracePoints.length > 0 && (
                  <div className="relative pl-5 space-y-2 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-700">
                    {tracePoints.map((point, index) => {
                      const sim = point.similarity;
                      const isSelected = point.id === selectedPointId;
                      const isFirst = sortOrder === 'asc' ? index === 0 : index === tracePoints.length - 1;
                      const isLast = sortOrder === 'asc' ? index === tracePoints.length - 1 : index === 0;

                      let timeGapStr: string | null = null;
                      if (index > 0) {
                        const prevT = new Date(tracePoints[index - 1].timestamp).getTime();
                        const currT = new Date(point.timestamp).getTime();
                        const diffMs = Math.abs(currT - prevT);
                        if (!isNaN(diffMs) && diffMs > 3000) {
                          timeGapStr = formatDuration(diffMs);
                        }
                      }

                      const badgeColor =
                        sim >= 75
                          ? 'border-emerald-700 text-emerald-400 bg-emerald-950/50'
                          : sim >= 50
                          ? 'border-amber-700 text-amber-400 bg-amber-950/50'
                          : 'border-red-700 text-red-400 bg-red-950/50';

                      return (
                        <div
                          key={point.id}
                          id={`trace-card-${point.id}`}
                          onClick={() => setSelectedPointId(point.id)}
                          className="relative group cursor-pointer"
                        >
                          {/* Time gap connector indicator */}
                          {timeGapStr && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 -mt-1 mb-1 pl-1">
                              <ArrowDown className="w-2.5 h-2.5 text-blue-400" />
                              <span>+{timeGapStr} later</span>
                            </div>
                          )}

                          {/* Waypoint circle pin */}
                          <div
                            className={`absolute -left-[25px] top-4 size-3.5 rounded-full bg-slate-950 border-2 transition-transform shadow ${
                              isSelected
                                ? 'scale-125 border-blue-400 ring-2 ring-blue-500/50'
                                : isFirst
                                ? 'border-emerald-500'
                                : isLast
                                ? 'border-amber-500'
                                : 'border-slate-600 group-hover:scale-110'
                            }`}
                          >
                            <div
                              className={`size-1 rounded-full m-auto mt-[2px] ${
                                isSelected
                                  ? 'bg-blue-400'
                                  : isFirst
                                  ? 'bg-emerald-400'
                                  : isLast
                                  ? 'bg-amber-400'
                                  : 'bg-slate-500'
                              }`}
                            />
                          </div>

                          {/* Sighting Card (Clean Solid UI - No Gradient) */}
                          <div
                            className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-all ${
                              isSelected
                                ? 'bg-slate-900 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                                : 'bg-[#0d1322] border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {/* Sequence number with role badge */}
                              <div className="flex flex-col items-center gap-0.5 shrink-0">
                                <div
                                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-mono font-bold border ${
                                    isFirst
                                      ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                                      : isLast
                                      ? 'bg-amber-950 border-amber-600 text-amber-300'
                                      : 'bg-slate-800 border-slate-700 text-slate-300'
                                  }`}
                                >
                                  #{index + 1}
                                </div>
                                {isFirst && (
                                  <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                                    START
                                  </span>
                                )}
                                {isLast && (
                                  <span className="text-[8px] font-bold uppercase tracking-wider text-amber-400 font-mono">
                                    LATEST
                                  </span>
                                )}
                              </div>

                              {/* Crop image */}
                              <div className="relative size-11 rounded-md border border-slate-700 bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center">
                                {point.sampleUrl ? (
                                  <img
                                    src={point.sampleUrl}
                                    alt="Detection crop"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <User className="w-5 h-5 text-slate-600" />
                                )}
                              </div>

                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <Camera className="w-3 h-3 text-blue-400 shrink-0" />
                                  <span className="font-semibold text-white text-xs truncate">{point.camera}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-slate-400 truncate mt-0.5">
                                  <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                  <span>{point.area}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono mt-0.5">
                                  <Clock className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                                  <span>{new Date(point.timestamp).toLocaleTimeString()}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${badgeColor}`}>
                                {sim}%
                              </span>
                              <ChevronRight
                                className={`w-4 h-4 transition-transform ${
                                  isSelected ? 'text-blue-400 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Column: Interactive Offline Map with Trajectory Trail & Playback HUD */}
          <div className="flex-1 min-h-[380px] lg:min-h-0 relative flex flex-col bg-[#050811] overflow-hidden">
            <FaceMovementTraceMapLoader
              tracePoints={tracePoints}
              selectedPointId={selectedPointId}
              onSelectPoint={(point) => {
                setSelectedPointId(point.id);
                const card = document.getElementById(`trace-card-${point.id}`);
                card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }}
              isMaximized={isMapMaximized}
              onToggleMaximize={() => setIsMapMaximized((prev) => !prev)}
              className="w-full h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return mounted ? createPortal(modalContent, document.body) : modalContent;
};
