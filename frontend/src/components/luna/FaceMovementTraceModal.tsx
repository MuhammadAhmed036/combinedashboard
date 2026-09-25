'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useCallback } from 'react';
import { LunaEvent, MovementTracePoint, ParsedLunaPersonInfo } from './types';
import { resolveLunaSampleUrl } from './lunaHelpers';
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
} from 'lucide-react';

interface LunaEventsResponse {
  events?: LunaEvent[];
}

interface FaceMovementTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: LunaEvent | null;
  personInfo: ParsedLunaPersonInfo | null;
}

export const FaceMovementTraceModal: React.FC<FaceMovementTraceModalProps> = ({
  isOpen,
  onClose,
  event,
  personInfo,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracePoints, setTracePoints] = useState<MovementTracePoint[]>([]);
  const [minSimilarity, setMinSimilarity] = useState<number>(0.5);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [timeRange, setTimeRange] = useState<string>('24h');

  const fetchTraceHistory = useCallback(async () => {
    if (!personInfo?.faceId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('top_similar_object_ids', personInfo.faceId);
      params.append('top_similar_object_similarity__gte', minSimilarity.toFixed(2));
      params.append('order', sortOrder);
      params.append('page_size', '100');

      const now = new Date();
      if (timeRange === '1h') {
        const past = new Date(now.getTime() - 60 * 60 * 1000);
        params.append('create_time__gte', past.toISOString());
      } else if (timeRange === '6h') {
        const past = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        params.append('create_time__gte', past.toISOString());
      } else if (timeRange === '24h') {
        const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        params.append('create_time__gte', past.toISOString());
      } else if (timeRange === '7d') {
        const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.append('create_time__gte', past.toISOString());
      }

      const res = await fetch(`/api/luna/events?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch trace events (${res.status})`);
      }

      const data: LunaEvent[] | LunaEventsResponse = await res.json();
      const events = Array.isArray(data) ? data : data.events || [];

      const points: MovementTracePoint[] = events.map((item, index) => {
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

        return {
          id: ev.event_id || `trace-${index}`,
          timestamp: ev.create_time || new Date().toISOString(),
          camera: ev.source || ev.handler_id || 'Camera',
          area: ev.location?.area || ev.location?.city || 'Zone',
          similarity: Math.round(sim * 100),
          sampleUrl: resolveLunaSampleUrl(sampleId),
          avatarUrl: personInfo.avatarUrl,
          faceId: personInfo.faceId,
          latitude: ev.location?.geo_position?.latitude,
          longitude: ev.location?.geo_position?.longitude,
        };
      });

      if (points.length === 0 && personInfo) {
        points.push({
          id: event?.event_id || 'initial-point',
          timestamp: personInfo.timestamp,
          camera: personInfo.cameraName,
          area: 'Detected Location',
          similarity: personInfo.similarity,
          sampleUrl: personInfo.sampleUrl,
          avatarUrl: personInfo.avatarUrl,
          faceId: personInfo.faceId,
        });
      }

      setTracePoints(points);
    } catch (err: unknown) {
      console.warn('[FaceMovementTrace] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load movement trace');
      if (personInfo) {
        setTracePoints([
          {
            id: event?.event_id || 'initial-point',
            timestamp: personInfo.timestamp,
            camera: personInfo.cameraName,
            area: 'Detected Location',
            similarity: personInfo.similarity,
            sampleUrl: personInfo.sampleUrl,
            avatarUrl: personInfo.avatarUrl,
            faceId: personInfo.faceId,
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [personInfo, minSimilarity, sortOrder, timeRange, event]);

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
      }, 0);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isOpen, personInfo, fetchTraceHistory]);

  if (!isOpen || !personInfo) return null;

  const totalDetections = tracePoints.length;
  const uniqueCameras = new Set(tracePoints.map((p) => p.camera)).size;
  const firstSeen = tracePoints.length > 0 ? tracePoints[0].timestamp : null;

  const exportTraceCSV = () => {
    const headers = ['Sequence', 'Timestamp', 'Camera', 'Area', 'Similarity', 'SampleUrl'];
    const rows = tracePoints.map((p, idx) => [
      idx + 1,
      `"${p.timestamp}"`,
      `"${p.camera}"`,
      `"${p.area}"`,
      `${p.similarity}%`,
      `"${p.sampleUrl || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `trace_${personInfo.name.replace(/\s+/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-800/60 text-cyan-400">
              <Navigation className="w-5 h-5 rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Person Movement Trace</h2>
                <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/80 text-[11px] font-mono">
                  {personInfo.name}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tracking historical sightings and trajectory across safe city surveillance nodes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportTraceCSV}
              disabled={tracePoints.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Person Identity Overview Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-6 py-3.5 bg-slate-950/40 border-b border-slate-800/80 text-xs">
          {/* Target Profile */}
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded border border-cyan-500/50 bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center">
              {personInfo.avatarUrl || personInfo.sampleUrl ? (
                <img
                  src={personInfo.avatarUrl || personInfo.sampleUrl!}
                  alt={personInfo.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-slate-600" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-200 truncate">{personInfo.name}</div>
              <div className="text-[11px] text-slate-400 truncate">List: {personInfo.listName}</div>
              <div className="text-[10px] text-cyan-400 font-mono">Match: {personInfo.similarity}%</div>
            </div>
          </div>

          {/* Sighting Metric 1 */}
          <div className="flex flex-col justify-center px-4 border-l border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Total Sightings</span>
            <span className="text-lg font-bold text-cyan-400 font-mono">{totalDetections}</span>
          </div>

          {/* Sighting Metric 2 */}
          <div className="flex flex-col justify-center px-4 border-l border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Cameras Visited</span>
            <span className="text-lg font-bold text-emerald-400 font-mono">{uniqueCameras} Nodes</span>
          </div>

          {/* Sighting Metric 3 */}
          <div className="flex flex-col justify-center px-4 border-l border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Time Span</span>
            <span className="text-xs text-slate-300 font-mono truncate">
              {firstSeen ? new Date(firstSeen).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>

        {/* Controls / Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Filter className="w-3.5 h-3.5" />
              <span>Time Range:</span>
            </div>
            <div className="flex rounded-md bg-slate-950 p-0.5 border border-slate-800">
              {(['1h', '6h', '24h', '7d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                    timeRange === r
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Min Similarity Slider */}
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-800">
              <span className="text-slate-400">Min Match:</span>
              <input
                type="range"
                min="0.3"
                max="0.95"
                step="0.05"
                value={minSimilarity}
                onChange={(e) => setMinSimilarity(parseFloat(e.target.value))}
                className="w-24 accent-cyan-500 cursor-pointer"
              />
              <span className="font-mono text-cyan-400 font-bold">{Math.round(minSimilarity * 100)}%</span>
            </div>
          </div>

          {/* Sort Order */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Chronology:</span>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 font-mono"
            >
              {sortOrder === 'asc' ? 'Earliest First (A→Z)' : 'Latest First (Z→A)'}
            </button>
          </div>
        </div>

        {/* Content Body: Timeline Trace View */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[500px]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              <span>Querying movement vectors from surveillance nodes...</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {!loading && tracePoints.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2 text-center">
              <Navigation className="w-8 h-8 text-slate-600" />
              <p>No additional movement events recorded for this face in the selected time range.</p>
            </div>
          )}

          {!loading && tracePoints.length > 0 && (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-cyan-500 before:via-blue-500 before:to-emerald-500">
              {tracePoints.map((point, index) => {
                const sim = point.similarity;
                const badgeColor =
                  sim >= 75
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-950/40'
                    : sim >= 50
                    ? 'border-amber-500 text-amber-400 bg-amber-950/40'
                    : 'border-rose-500 text-rose-400 bg-rose-950/40';

                return (
                  <div key={point.id} className="relative group">
                    <div className="absolute -left-[27px] top-4 w-4 h-4 rounded-full bg-slate-950 border-2 border-cyan-400 flex items-center justify-center group-hover:scale-125 transition-transform shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg border border-slate-800 bg-slate-950/70 hover:border-cyan-500/50 hover:bg-slate-900/90 transition-all shadow">
                      <div className="flex items-center gap-4">
                        <div className="px-2 py-1 rounded bg-slate-800/80 border border-slate-700 text-xs font-mono font-bold text-cyan-300">
                          #{index + 1}
                        </div>

                        <div className="relative w-14 h-14 rounded border border-cyan-500/40 bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center">
                          {point.sampleUrl ? (
                            <img
                              src={point.sampleUrl}
                              alt="Detection crop"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-6 h-6 text-slate-600" />
                          )}
                        </div>

                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Camera className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="font-semibold text-slate-100 text-sm">{point.camera}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>{point.area}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 sm:text-right w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
                        <div className="flex flex-col sm:items-end">
                          <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>{new Date(point.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {new Date(point.timestamp).toLocaleDateString()}
                          </div>
                        </div>

                        <div className={`px-2.5 py-1 rounded-md border text-xs font-bold font-mono ${badgeColor}`}>
                          {sim}% Match
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
