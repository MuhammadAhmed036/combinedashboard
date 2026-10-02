'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl, { Map as MapLibreMap, Marker, Popup, LngLatBounds } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { MovementTracePoint } from './types';
import {
  MAP_CENTER,
  buildSatelliteStyle,
  buildVectorStyle,
} from '@/components/map/mapStyles';
import {
  Maximize2,
  Minimize2,
  Crosshair,
  Layers,
  Minus,
  Navigation,
  Plus,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Camera,
  Clock,
  Compass,
} from 'lucide-react';
import { cn } from '@/lib/utils';

let pmtilesRegistered = false;
function ensurePmtilesProtocol() {
  if (pmtilesRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));
  pmtilesRegistered = true;
}

interface FaceMovementTraceMapProps {
  tracePoints: MovementTracePoint[];
  selectedPointId?: string | null;
  onSelectPoint?: (point: MovementTracePoint) => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  className?: string;
}

export const FaceMovementTraceMap: React.FC<FaceMovementTraceMapProps> = ({
  tracePoints,
  selectedPointId,
  onSelectPoint,
  isMaximized = false,
  onToggleMaximize,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupsRef = useRef<Popup[]>([]);

  const [activeLayer, setActiveLayer] = useState<'vector' | 'satellite'>('vector');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter valid points with lat/lng
  const validPoints = useMemo(() => {
    return tracePoints.filter(
      (p) => typeof p.longitude === 'number' && typeof p.latitude === 'number' && !isNaN(p.longitude) && !isNaN(p.latitude)
    );
  }, [tracePoints]);

  // Micro-offset generator to prevent markers at the same camera from completely overlapping
  const spreadPoints = useMemo(() => {
    const cameraCounts = new Map<string, number>();
    return validPoints.map((pt, idx) => {
      const camKey = pt.camera.toLowerCase().trim();
      const count = cameraCounts.get(camKey) || 0;
      cameraCounts.set(camKey, count + 1);

      if (count === 0) {
        return { ...pt, displayLng: pt.longitude!, displayLat: pt.latitude!, visitIndex: count };
      }

      // Apply subtle radial spread (20-30 meters) in a spiral around the camera
      const angle = (count * 137.5 * Math.PI) / 180;
      const radius = 0.00028 * Math.sqrt(count);
      const dLng = radius * Math.cos(angle);
      const dLat = radius * Math.sin(angle);

      return {
        ...pt,
        displayLng: pt.longitude! + dLng,
        displayLat: pt.latitude! + dLat,
        visitIndex: count,
      };
    });
  }, [validPoints]);

  // Current active index
  const activeIndex = useMemo(() => {
    if (!selectedPointId) return 0;
    const idx = spreadPoints.findIndex((p) => p.id === selectedPointId);
    return idx >= 0 ? idx : 0;
  }, [selectedPointId, spreadPoints]);

  // Trajectory Layer Helper (Enterprise Solid Tactical Theme)
  const setupTrajectoryLayers = useCallback((map: MapLibreMap) => {
    if (map.getSource('trace-trajectory')) return;

    map.addSource('trace-trajectory', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    // 1. Subtle solid outer casing (No gradients)
    map.addLayer({
      id: 'trace-route-casing',
      type: 'line',
      source: 'trace-trajectory',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#0369a1',
        'line-width': 7,
        'line-opacity': 0.4,
      },
    });

    // 2. High-contrast crisp core trajectory line
    map.addLayer({
      id: 'trace-route-core',
      type: 'line',
      source: 'trace-trajectory',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#38bdf8',
        'line-width': 3.5,
        'line-opacity': 1,
      },
    });

    // 3. Directional chevrons along trajectory line
    map.addLayer({
      id: 'trace-route-chevrons',
      type: 'symbol',
      source: 'trace-trajectory',
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 75,
        'text-field': '➤',
        'text-size': 13,
        'text-keep-upright': false,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#0284c7',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
  }, []);

  // Update Trajectory Route GeoJSON data
  const updateTrajectoryData = useCallback(
    (map: MapLibreMap, points: typeof spreadPoints) => {
      const source = map.getSource('trace-trajectory') as maplibregl.GeoJSONSource | undefined;
      if (!source) {
        setupTrajectoryLayers(map);
      }

      const activeSource = map.getSource('trace-trajectory') as maplibregl.GeoJSONSource | undefined;
      if (!activeSource) return;

      if (points.length < 2) {
        activeSource.setData({
          type: 'FeatureCollection',
          features: [],
        });
        return;
      }

      const coords = points.map((p) => [p.displayLng, p.displayLat]);

      activeSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
            properties: {
              name: 'movement-path',
            },
          },
        ],
      });
    },
    [setupTrajectoryLayers]
  );

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtilesProtocol();

    const initialCenter =
      validPoints.length > 0
        ? ([validPoints[0].longitude!, validPoints[0].latitude!] as [number, number])
        : MAP_CENTER;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: activeLayer === 'satellite' ? buildSatelliteStyle() : buildVectorStyle('dark'),
      center: initialCenter,
      zoom: 14,
      attributionControl: false,
    });

    // Enable smooth navigation
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();

    mapRef.current = map;

    map.on('load', () => {
      setMapLoaded(true);
      setupTrajectoryLayers(map);
      updateTrajectoryData(map, spreadPoints);
    });

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Handle Layer Style Toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    map.setStyle(activeLayer === 'satellite' ? buildSatelliteStyle() : buildVectorStyle('dark'));

    map.once('style.load', () => {
      setupTrajectoryLayers(map);
      updateTrajectoryData(map, spreadPoints);
    });
  }, [activeLayer, mapLoaded, setupTrajectoryLayers, updateTrajectoryData, spreadPoints]);

  // Trigger resize whenever isMaximized state changes
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.resize();
      }, 50);
    }
  }, [isMaximized]);

  // Center & Fit Track Bounds Handler
  const fitTrackBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map || spreadPoints.length === 0) return;

    if (spreadPoints.length === 1) {
      map.easeTo({
        center: [spreadPoints[0].displayLng, spreadPoints[0].displayLat],
        zoom: 15.5,
        duration: 500,
      });
      return;
    }

    const bounds = new LngLatBounds();
    spreadPoints.forEach((p) => bounds.extend([p.displayLng, p.displayLat]));

    map.fitBounds(bounds, {
      padding: { top: 60, bottom: 85, left: 60, right: 60 },
      maxZoom: 16.5,
      duration: 600,
    });
  }, [spreadPoints]);

  // Auto-fit bounds ONCE when trace points first arrive
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    if (mapLoaded && spreadPoints.length > 0 && !initialFitDoneRef.current) {
      fitTrackBounds();
      initialFitDoneRef.current = true;
    }
  }, [mapLoaded, spreadPoints, fitTrackBounds]);

  // Render Clean Enterprise Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    popupsRef.current = [];

    // Update GeoJSON Trajectory Line
    updateTrajectoryData(map, spreadPoints);

    const totalPts = spreadPoints.length;

    spreadPoints.forEach((point, index) => {
      const isSelected = point.id === selectedPointId;
      const isFirst = index === 0;
      const isLast = index === totalPts - 1;

      // Clean Enterprise Palette (Solid colors, no gradient glow)
      let pinBorder = '#475569';
      let pinBg = '#0f172a';
      let badgeLabel = `#${index + 1}`;
      let roleLabel = '';

      if (isFirst) {
        pinBorder = '#10b981'; // Solid Emerald
        pinBg = '#064e3b';
        badgeLabel = `START #${index + 1}`;
        roleLabel = 'START NODE';
      } else if (isLast) {
        pinBorder = '#f59e0b'; // Solid Amber
        pinBg = '#78350f';
        badgeLabel = `LATEST #${index + 1}`;
        roleLabel = 'LATEST NODE';
      }

      if (isSelected) {
        pinBorder = '#38bdf8'; // Sky blue border
      }

      // Marker DOM Element
      const markerEl = document.createElement('div');
      markerEl.className = 'trace-marker select-none cursor-pointer';
      markerEl.style.transform = isSelected ? 'scale(1.18)' : 'scale(1)';
      markerEl.style.transition = 'transform 0.2s ease, z-index 0.2s ease';
      markerEl.style.zIndex = isSelected ? '1000' : isLast ? '900' : isFirst ? '850' : `${100 + index}`;

      const pulseRing =
        isLast || isSelected
          ? `<div style="position:absolute;inset:-4px;border-radius:9999px;border:2px solid ${pinBorder};opacity:0.75;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>`
          : '';

      markerEl.innerHTML = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          ${pulseRing}
          <div style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:${pinBg};border:1.5px solid ${pinBorder};box-shadow:0 4px 12px rgba(0,0,0,0.7);color:#f8fafc;font-family:monospace;font-size:11px;font-weight:700;white-space:nowrap;">
            ${isFirst ? '<span style="color:#34d399;">●</span>' : isLast ? '<span style="color:#fbbf24;">●</span>' : ''}
            <span>${badgeLabel}</span>
          </div>
          <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${pinBorder};margin-top:-1px;"></div>
        </div>
      `;

      // Popup HUD Card
      const timeStr = new Date(point.timestamp).toLocaleTimeString();
      const dateStr = new Date(point.timestamp).toLocaleDateString();

      const popupHtml = `
        <div style="background:#0f172a;color:#f8fafc;padding:12px;border-radius:8px;font-family:sans-serif;font-size:12px;border:1px solid #334155;box-shadow:0 12px 28px rgba(0,0,0,0.85);min-width:230px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid #1e293b;padding-bottom:6px;">
            <span style="background:${pinBg};border:1px solid ${pinBorder};color:#f8fafc;font-weight:700;padding:2px 7px;border-radius:4px;font-size:10px;font-family:monospace;">
              ${roleLabel ? roleLabel + ' • ' : ''}WAYPOINT #${index + 1}
            </span>
            <span style="color:#34d399;font-weight:700;font-family:monospace;font-size:11px;">
              ${point.similarity}% MATCH
            </span>
          </div>

          ${
            point.sampleUrl
              ? `<div style="position:relative;width:100%;height:120px;border-radius:6px;overflow:hidden;margin-bottom:8px;border:1px solid #334155;background:#020617;">
                  <img src="${point.sampleUrl}" style="width:100%;height:100%;object-fit:cover;" />
                </div>`
              : ''
          }

          <div style="display:flex;flex-direction:column;gap:5px;">
            <div style="display:flex;align-items:center;gap:6px;color:#f1f5f9;font-weight:600;font-size:12px;">
              <span style="color:#38bdf8;">📷</span> ${point.camera}
            </div>
            <div style="display:flex;align-items:center;gap:6px;color:#94a3b8;font-size:11px;font-family:monospace;">
              <span>🕒</span> ${timeStr} • ${dateStr}
            </div>
            <div style="display:flex;align-items:center;gap:6px;color:#64748b;font-size:10px;font-family:monospace;">
              <span>📍</span> [${point.latitude?.toFixed(4)}, ${point.longitude?.toFixed(4)}]
            </div>
          </div>
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: 14,
        closeButton: true,
        className: 'custom-trace-popup',
      }).setHTML(popupHtml);

      popupsRef.current.push(popup);

      const marker = new maplibregl.Marker({ element: markerEl })
        .setLngLat([point.displayLng, point.displayLat])
        .setPopup(popup)
        .addTo(map);

      markerEl.addEventListener('click', () => {
        onSelectPoint?.(point);
      });

      markersRef.current.push(marker);

      if (isSelected) {
        popup.addTo(map);
      }
    });
  }, [spreadPoints, selectedPointId, mapLoaded, onSelectPoint, updateTrajectoryData]);

  // Smooth Pan on Selection Change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPointId) return;

    const pt = spreadPoints.find((p) => p.id === selectedPointId);
    if (pt) {
      map.easeTo({
        center: [pt.displayLng, pt.displayLat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 500,
      });
    }
  }, [selectedPointId, spreadPoints]);

  // Journey Playback Controller
  const handleStepTo = useCallback(
    (index: number) => {
      if (spreadPoints.length === 0) return;
      const targetIndex = Math.max(0, Math.min(index, spreadPoints.length - 1));
      const targetPoint = spreadPoints[targetIndex];
      onSelectPoint?.(targetPoint);
    },
    [spreadPoints, onSelectPoint]
  );

  const togglePlayback = () => {
    setIsPlaying((prev) => !prev);
  };

  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      return;
    }

    if (spreadPoints.length === 0) {
      setIsPlaying(false);
      return;
    }

    const intervalMs = 1700 / playbackSpeed;

    playTimerRef.current = setTimeout(() => {
      const nextIndex = (activeIndex + 1) % spreadPoints.length;
      handleStepTo(nextIndex);
      if (nextIndex === spreadPoints.length - 1) {
        setIsPlaying(false);
      }
    }, intervalMs);

    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, activeIndex, spreadPoints.length, playbackSpeed, handleStepTo]);

  const activePoint = spreadPoints[activeIndex];

  return (
    <div className={cn('relative w-full h-full min-h-[350px] bg-[#090d16] overflow-hidden select-none', className)}>
      {/* Map Canvas */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Left Badge: Clean Enterprise Indicator */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/95 border border-slate-700/80 text-[11px] text-slate-200 font-mono shadow-md">
        <Navigation className="w-3.5 h-3.5 text-blue-400 rotate-45" />
        <span className="font-semibold tracking-wider">OFFLINE SURVEILLANCE GRID</span>
        <span className="text-slate-600">•</span>
        <span className="text-emerald-400 font-bold">{spreadPoints.length} Waypoints</span>
      </div>

      {/* Top Right Controls Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 p-1 rounded-lg bg-slate-900/95 border border-slate-700/80 shadow-md">
        {/* Layer Switcher */}
        <button
          type="button"
          onClick={() => setActiveLayer(activeLayer === 'vector' ? 'satellite' : 'vector')}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer',
            activeLayer === 'satellite'
              ? 'bg-slate-800 text-blue-400 border border-slate-700'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          )}
          title="Toggle Satellite / Vector Map"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="capitalize">{activeLayer}</span>
        </button>

        {/* Center / Focus All Waypoints (Crosshair) */}
        <button
          type="button"
          onClick={fitTrackBounds}
          className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Center and Fit Entire Trajectory on Map"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Expand / Maximize Map (Toggles Sidebar) - The button the user highlighted! */}
        {onToggleMaximize && (
          <button
            type="button"
            onClick={onToggleMaximize}
            className={cn(
              'p-1.5 rounded transition-colors cursor-pointer',
              isMaximized
                ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            )}
            title={isMaximized ? 'Restore Sidebar (Split View)' : 'Maximize Map (Full View)'}
          >
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}

        {/* Zoom In */}
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Zoom Out */}
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Interactive Journey Player HUD */}
      {spreadPoints.length > 0 && (
        <div className="absolute bottom-3 inset-x-3 z-10 flex flex-col sm:flex-row items-center justify-between gap-3 px-3.5 py-2 rounded-lg bg-slate-900/95 border border-slate-700/80 shadow-lg text-xs">
          {/* Left: Journey Playback Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleStepTo(0)}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Reset to Origin / Start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleStepTo(activeIndex - 1)}
              disabled={activeIndex <= 0}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              title="Previous Waypoint"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={togglePlayback}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-colors shadow-sm cursor-pointer',
                isPlaying
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              )}
              title={isPlaying ? 'Pause Movement Trail' : 'Auto Play Movement Trail'}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play Trail</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleStepTo(activeIndex + 1)}
              disabled={activeIndex >= spreadPoints.length - 1}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              title="Next Waypoint"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Speed toggle */}
            <button
              type="button"
              onClick={() => setPlaybackSpeed((s) => (s === 1 ? 2 : 1))}
              className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono font-bold text-slate-300 hover:text-white cursor-pointer"
              title="Toggle Playback Speed"
            >
              {playbackSpeed}x
            </button>
          </div>

          {/* Center: Active Waypoint Detail */}
          {activePoint && (
            <div className="flex items-center gap-2.5 font-mono text-[11px] text-slate-300 truncate">
              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-bold shrink-0">
                Step {activeIndex + 1} of {spreadPoints.length}
              </span>
              <div className="flex items-center gap-1.5 truncate">
                <Camera className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="font-semibold text-white truncate">{activePoint.camera}</span>
              </div>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <div className="flex items-center gap-1 text-slate-400 shrink-0 hidden sm:flex">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>{new Date(activePoint.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          )}

          {/* Right Legend */}
          <div className="hidden lg:flex items-center gap-3 text-[10.5px] font-mono text-slate-400 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span>Start</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-400" />
              <span>Trail</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" />
              <span>Latest</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
