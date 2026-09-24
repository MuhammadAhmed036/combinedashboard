"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Marker, Popup } from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { CameraLocation, CameraStatus, MapRegion } from "@/lib/types";
import {
  MAP_BOUNDS,
  MAP_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MAX_ZOOM,
  buildSatelliteStyle,
  buildVectorStyle,
} from "@/components/map/mapStyles";
import type { MapTheme } from "@/components/map/mapStyles";
import { Crosshair, Expand, Minus, PenLine, Plus, Undo2, X } from "lucide-react";
import { MapLayerToggle } from "@/components/map/MapControls";
import { SaveRegionModal } from "@/components/map/SaveRegionModal";
import { useCreateMapRegion, useDeleteMapRegion, useMapRegions } from "@/lib/hooks/useMapRegions";
import { fetchLatestCameraSnapshot } from "@/lib/services/cameraLocationsService";
import { liveEventImageUrl } from "@/lib/hooks/useCameraLiveFeed";
import { extractPersonBoxes, type NormBox } from "@/lib/detectionBoxes";
import { cn } from "@/lib/utils";

let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));
  protocolRegistered = true;
}

function getDocumentTheme(): MapTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

const ZONE_PALETTE = ["#3b82f6", "#a855f7", "#f97316", "#22c55e", "#ec4899", "#eab308", "#06b6d4"];

export function zoneColor(zone: string | null): string {
  if (!zone) return "#94a3b8";
  let hash = 0;
  for (let i = 0; i < zone.length; i++) hash = (hash * 31 + zone.charCodeAt(i)) >>> 0;
  return ZONE_PALETTE[hash % ZONE_PALETTE.length];
}

/**
 * A `CameraLocation` (registry/DB row) enriched with the live data the map
 * needs for marker state and the hover tooltip — sourced from the same
 * live-stream feed and websocket the Cameras page and camera feeds use, not
 * from the registry itself.
 */
export interface CameraMarkerData extends CameraLocation {
  status: CameraStatus;
  livePeopleCount: number;
  /** Total person-count readings summed over the last hour, or null while it hasn't loaded. */
  lastHourPeopleCount: number | null;
}

/**
 * The camera info popup — built as real DOM nodes (via `Popup.setDOMContent`,
 * not `setHTML`) rather than an HTML string, because the frame image loads
 * asynchronously after the popup already opens: the stats render instantly,
 * then `fetchCameraLatestFrame` fills in the image + detection boxes once it
 * resolves, patching the same live nodes in place.
 */
interface CameraPopupRefs {
  cameraId: string;
  statusDot: HTMLSpanElement;
  statusText: HTMLSpanElement;
  liveCountValue: HTMLSpanElement;
  lastHourValue: HTMLSpanElement;
  frameSlot: HTMLDivElement;
}

function applyPopupStats(refs: CameraPopupRefs, camera: CameraMarkerData): void {
  const online = camera.status === "online";
  const statusColor = online ? "var(--status-active)" : "var(--destructive)";
  refs.statusDot.style.background = statusColor;
  refs.statusText.textContent = online ? "Online" : "Offline";
  refs.statusText.style.color = statusColor;
  refs.liveCountValue.textContent = String(camera.livePeopleCount);
  refs.lastHourValue.textContent =
    camera.lastHourPeopleCount === null ? "—" : String(camera.lastHourPeopleCount);
}

function buildStatTile(label: string): { tile: HTMLDivElement; value: HTMLSpanElement } {
  const tile = document.createElement("div");
  tile.style.cssText =
    "border:1px solid var(--surface-border);border-radius:10px;padding:8px 10px;background:var(--surface-1);";
  const labelEl = document.createElement("div");
  labelEl.textContent = label;
  labelEl.style.cssText =
    "font-size:9.5px;font-weight:600;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;";
  const value = document.createElement("span");
  value.style.cssText = "font-size:18px;font-weight:700;color:var(--foreground);line-height:1;";
  tile.appendChild(labelEl);
  tile.appendChild(value);
  return { tile, value };
}

function buildPopupContent(camera: CameraMarkerData): { element: HTMLDivElement; refs: CameraPopupRefs } {
  const card = document.createElement("div");
  card.style.cssText =
    "width:272px;border-radius:16px;overflow:hidden;background:var(--surface-2);border:1px solid var(--surface-border);box-shadow:0 16px 40px rgba(0,0,0,0.4);font:12px/1.4 inherit;color:var(--foreground);";

  // --- Frame preview ---
  const imageWrap = document.createElement("div");
  imageWrap.style.cssText = "position:relative;width:100%;aspect-ratio:16/9;background:#05070d;";

  const frameSlot = document.createElement("div");
  frameSlot.style.cssText = "position:absolute;inset:0;";
  const loadingLabel = document.createElement("div");
  loadingLabel.textContent = "Loading frame…";
  loadingLabel.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted-foreground);font-size:11px;";
  frameSlot.appendChild(loadingLabel);
  imageWrap.appendChild(frameSlot);

  const statusDot = document.createElement("span");
  statusDot.style.cssText = "width:7px;height:7px;border-radius:9999px;display:inline-block;";
  const statusText = document.createElement("span");
  statusText.style.cssText = "font-weight:600;font-size:10.5px;";
  const statusBadge = document.createElement("div");
  statusBadge.style.cssText =
    "position:absolute;top:8px;left:8px;z-index:2;display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:9999px;background:rgba(5,7,13,0.75);backdrop-filter:blur(4px);";
  statusBadge.appendChild(statusDot);
  statusBadge.appendChild(statusText);
  imageWrap.appendChild(statusBadge);

  card.appendChild(imageWrap);

  // --- Body ---
  const body = document.createElement("div");
  body.style.cssText = "padding:11px 13px 13px;";

  const title = document.createElement("div");
  title.textContent = camera.cameraName;
  title.style.cssText =
    "font-weight:600;font-size:13.5px;margin-bottom:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  body.appendChild(title);

  const statsGrid = document.createElement("div");
  statsGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;";
  const liveStat = buildStatTile("Live Count");
  const lastHourStat = buildStatTile("Last 1h Total");
  statsGrid.appendChild(liveStat.tile);
  statsGrid.appendChild(lastHourStat.tile);
  body.appendChild(statsGrid);

  card.appendChild(body);

  const refs: CameraPopupRefs = {
    cameraId: camera.cameraId,
    statusDot,
    statusText,
    liveCountValue: liveStat.value,
    lastHourValue: lastHourStat.value,
    frameSlot,
  };
  applyPopupStats(refs, camera);
  return { element: card, refs };
}

function renderPopupFrameEmpty(frameSlot: HTMLDivElement, message: string): void {
  frameSlot.innerHTML = "";
  const empty = document.createElement("div");
  empty.textContent = message;
  empty.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 16px;color:var(--muted-foreground);font-size:11px;";
  frameSlot.appendChild(empty);
}

function renderPopupFrame(
  frameSlot: HTMLDivElement,
  data: { imageUrl: string; personBoxes: NormBox[] }
): void {
  frameSlot.innerHTML = "";

  const img = document.createElement("img");
  img.alt = "Latest camera frame";
  img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
  img.onerror = () => renderPopupFrameEmpty(frameSlot, "Frame image unavailable");
  img.src = data.imageUrl;
  frameSlot.appendChild(img);

  // Detected-people overlay — same normalized-box-to-percentage technique
  // used for region alert overlays elsewhere in the app.
  data.personBoxes.forEach((box) => {
    const boxEl = document.createElement("div");
    boxEl.style.cssText = `position:absolute;border:2px solid #22c55e;border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,0.45);left:${box.x1 * 100}%;top:${box.y1 * 100}%;width:${(box.x2 - box.x1) * 100}%;height:${(box.y2 - box.y1) * 100}%;`;
    frameSlot.appendChild(boxEl);
  });

  const countBadge = document.createElement("div");
  countBadge.textContent =
    data.personBoxes.length > 0
      ? `${data.personBoxes.length} detected`
      : "No person detected";
  countBadge.style.cssText = `position:absolute;bottom:7px;right:7px;z-index:2;padding:3px 8px;border-radius:9999px;background:rgba(5,7,13,0.75);backdrop-filter:blur(4px);font-size:10px;font-weight:600;color:${data.personBoxes.length > 0 ? "#22c55e" : "var(--muted-foreground)"};`;
  frameSlot.appendChild(countBadge);
}

/** Latest captured frame for a camera, plus its detected-person boxes for the overlay — the same detection detail `useAlertWatcher`/`useNoPersonWatcher` fetch, reused here for display instead of rule evaluation. */
async function fetchCameraLatestFrame(
  cameraId: string
): Promise<{ imageUrl: string; personBoxes: NormBox[] } | null> {
  const snapshot = await fetchLatestCameraSnapshot(cameraId).catch(() => null);
  if (!snapshot) return null;

  const response = await fetch(`/api/ai/v2/events/${encodeURIComponent(snapshot.eventId)}`, {
    cache: "no-store",
  }).catch(() => null);
  const personBoxes = response?.ok ? extractPersonBoxes(await response.json()) : [];

  return { imageUrl: liveEventImageUrl(snapshot.eventId), personBoxes };
}

const REGIONS_SOURCE_ID = "user-regions";
const DRAFT_SOURCE_ID = "draft-region";
const DRAFT_COLOR = "#ef4444";

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function regionToFeature(region: MapRegion): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: { id: region.id, name: region.name, color: region.color },
    geometry: { type: "Polygon", coordinates: [[...region.coordinates, region.coordinates[0]]] },
  };
}

function regionsToFeatureCollection(regions: MapRegion[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: regions.map(regionToFeature) };
}

// Points always rendered so each placed vertex is visible while drawing; a
// LineString covers the 2-point case (not enough for a polygon yet), and a
// Polygon takes over once there's a closed shape — no need to keep both,
// since a "line" layer already renders a Polygon's boundary.
function draftToFeatureCollection(points: [number, number][]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (points.length === 2) {
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } });
  } else if (points.length >= 3) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
    });
  }
  points.forEach((point) => {
    features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: point } });
  });
  return { type: "FeatureCollection", features };
}

// Re-added every time the style (re)loads — `map.setStyle()` (vector <->
// satellite toggle) destroys and rebuilds the entire style, including any
// sources/layers added imperatively like these, so they can't just be set
// up once at mount.
function ensureRegionLayers(map: MapLibreMap) {
  if (!map.getSource(REGIONS_SOURCE_ID)) {
    map.addSource(REGIONS_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  }
  if (!map.getSource(DRAFT_SOURCE_ID)) {
    map.addSource(DRAFT_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  }

  // Sit above roads/buildings/water but below place/road name labels, so
  // saved regions don't obscure the base map's own text.
  const beforeId = map.getStyle()?.layers?.find((layer) => layer.id.includes("label"))?.id;

  if (!map.getLayer("user-regions-fill")) {
    map.addLayer(
      {
        id: "user-regions-fill",
        type: "fill",
        source: REGIONS_SOURCE_ID,
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.22 },
      },
      beforeId
    );
  }
  if (!map.getLayer("user-regions-line")) {
    map.addLayer(
      {
        id: "user-regions-line",
        type: "line",
        source: REGIONS_SOURCE_ID,
        paint: { "line-color": ["get", "color"], "line-width": 2.5 },
      },
      beforeId
    );
  }
  if (!map.getLayer("user-regions-label")) {
    map.addLayer({
      id: "user-regions-label",
      type: "symbol",
      source: REGIONS_SOURCE_ID,
      layout: { "text-field": ["get", "name"], "text-size": 12, "text-font": ["Noto Sans Bold"] },
      paint: { "text-color": "#ffffff", "text-halo-color": "#000000", "text-halo-width": 1.2 },
    });
  }

  if (!map.getLayer("draft-region-fill")) {
    map.addLayer(
      {
        id: "draft-region-fill",
        type: "fill",
        source: DRAFT_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": DRAFT_COLOR, "fill-opacity": 0.15 },
      },
      beforeId
    );
  }
  if (!map.getLayer("draft-region-line")) {
    map.addLayer(
      {
        id: "draft-region-line",
        type: "line",
        source: DRAFT_SOURCE_ID,
        filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
        paint: { "line-color": DRAFT_COLOR, "line-width": 2, "line-dasharray": [2, 2] },
      },
      beforeId
    );
  }
  if (!map.getLayer("draft-region-points")) {
    map.addLayer({
      id: "draft-region-points",
      type: "circle",
      source: DRAFT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": DRAFT_COLOR,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

function createMarkerElement(camera: CameraMarkerData): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${camera.cameraName} location`);
  el.style.padding = "0";
  // Deliberately NOT setting `position` here. MapLibre's own
  // `.maplibregl-marker` stylesheet rule requires `position: absolute` on
  // this exact element for its per-frame `transform: translate(...)`
  // updates to track the map correctly — an inline `position` override on
  // it (even just to `relative`, previously used only to anchor the status
  // dot below) beats that rule via specificity and makes the marker drift
  // out of sync with the basemap during zoom/pan. The status dot gets its
  // own positioning context on `inner` instead, one level down.

  const inner = document.createElement("div");
  inner.style.position = "relative";
  inner.style.width = "100%";
  inner.style.height = "100%";
  el.appendChild(inner);

  const icon = document.createElement("img");
  icon.className = "camera-marker-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.alt = "";
  icon.src = "/camera-icon.png";
  icon.style.position = "absolute";
  icon.style.inset = "0";
  icon.style.width = "100%";
  icon.style.height = "100%";
  icon.style.objectFit = "contain";
  inner.appendChild(icon);

  // Small online/offline indicator, separate from the icon so both pieces
  // of state (identity vs. live status) stay legible at once instead of
  // overloading a single color.
  const statusDot = document.createElement("span");
  statusDot.className = "camera-marker-status-dot";
  statusDot.style.position = "absolute";
  statusDot.style.right = "-2px";
  statusDot.style.bottom = "-2px";
  statusDot.style.width = "10px";
  statusDot.style.height = "10px";
  statusDot.style.borderRadius = "9999px";
  statusDot.style.borderWidth = "2px";
  statusDot.style.borderStyle = "solid";
  inner.appendChild(statusDot);
  return el;
}

function applyMarkerStyle(
  el: HTMLButtonElement,
  camera: CameraMarkerData,
  selected: boolean,
  placing: boolean
) {
  // MapLibre positions markers by writing `transform` directly onto this
  // element on every render tick (translate for lng/lat). Never put `scale`
  // or any other `transform` in this element's own CSS (hover/active
  // included) — the two would fight over the same property every frame and
  // the marker visibly jitters. Hover/active feedback below only uses
  // filter/shadow, which MapLibre never touches.
  //
  // Just as important: never reassign `el.className` here. MapLibre adds
  // its own `maplibregl-marker`/anchor classes to this exact element when
  // the marker is constructed, and its absolute positioning depends on
  // them — `el.className = "..."` replaces the WHOLE class list, silently
  // wiping those out on every refresh (this runs on every camera poll
  // tick) and making the marker drift out of sync with the map afterward.
  // All visual styling below therefore targets `inner` (the wrapper div
  // this file fully owns), never `el` itself.
  const size = selected ? 40 : 32;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.opacity = camera.status === "online" ? "1" : "0.55";

  const inner = el.firstElementChild as HTMLDivElement | null;
  if (inner) {
    inner.className = cn(
      "transition-[filter,box-shadow,opacity]",
      (placing || selected) && "animate-pulse",
      // Not draggable unless armed for placement — a plain click only
      // selects a camera, it never moves it.
      placing ? "cursor-crosshair" : "cursor-pointer hover:brightness-110 hover:shadow-xl"
    );
  }

  const dot = el.querySelector<HTMLSpanElement>(".camera-marker-status-dot");
  if (dot) {
    dot.style.backgroundColor =
      camera.status === "online" ? "var(--status-active)" : "var(--destructive)";
    dot.style.borderColor = "var(--surface-2)";
  }
}

export interface FlyToTarget {
  center: [number, number];
  zoom: number;
}

export interface CameraLocationMapProps {
  cameras: CameraMarkerData[];
  selectedCameraId: string | null;
  onSelectCamera: (cameraId: string) => void;
  onDragEnd: (cameraId: string, latitude: number, longitude: number) => void;
  placementCameraId: string | null;
  onPickLocation: (latitude: number, longitude: number) => void;
  flyToTarget?: FlyToTarget | null;
  className?: string;
}

export function CameraLocationMap({
  cameras,
  selectedCameraId,
  onSelectCamera,
  onDragEnd,
  placementCameraId,
  onPickLocation,
  flyToTarget,
  className,
}: CameraLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  // Cameras currently mid-drag gesture — the periodic poll refresh (every
  // few seconds) must not reposition these, or the marker fights the user's
  // own drag and visibly snaps back to the old server position.
  const draggingRef = useRef<Set<string>>(new Set());
  // Cameras with a position the user just set (drag / pick-on-map) that the
  // backend hasn't echoed back yet. Without this, the marker snaps back to
  // the stale pre-save position for the few hundred ms between the drop and
  // the mutation's cache refresh landing, then snaps forward again —
  // exactly the "camera doesn't stay where I put it" symptom.
  const pendingPositionRef = useRef<Map<string, [number, number]>>(new Map());
  // Latest camera data per id, kept outside React state so the click
  // handler (attached once, at marker creation) always reads fresh
  // status/counts instead of whatever camera object existed when that
  // particular marker element was first created.
  const cameraDataRef = useRef<Map<string, CameraMarkerData>>(new Map());
  // Info popup only opens on click now (not hover) — showing live/last-hour
  // counts on every mouse pass-over was noisy; a click is a deliberate ask.
  const popupRef = useRef<Popup | null>(null);
  // Holds the currently-open popup's live DOM node references (not just its
  // camera id) so the stats-refresh pass below can patch numbers in place
  // without re-fetching the frame image or rebuilding the whole popup.
  const activePopupRef = useRef<CameraPopupRefs | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapMounted, setMapMounted] = useState(false);
  const [viewMode, setViewMode] = useState<"vector" | "satellite">("vector");
  const [theme, setTheme] = useState<MapTheme>(() => getDocumentTheme());

  // Custom drawn regions — persisted to data/map-regions.json via the API.
  const { data: regions } = useMapRegions();
  const createRegion = useCreateMapRegion();
  const deleteRegion = useDeleteMapRegion();
  const [drawMode, setDrawMode] = useState(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  // Mirrors of the above so the map-instance effects below (which must keep
  // stable `[]`/`[mapReady]` dependency arrays to avoid tearing down and
  // rebuilding map listeners on every keystroke-level state change) always
  // read the latest values instead of a stale snapshot from mount time.
  const regionsRef = useRef<MapRegion[]>([]);
  const draftPointsRef = useRef<[number, number][]>([]);
  useEffect(() => {
    regionsRef.current = regions ?? [];
  }, [regions]);
  useEffect(() => {
    draftPointsRef.current = draftPoints;
  }, [draftPoints]);

  const placedCameras = useMemo(
    () => cameras.filter((c) => c.latitude !== null && c.longitude !== null),
    [cameras]
  );

  const onDragEndRef = useRef(onDragEnd);
  const onSelectCameraRef = useRef(onSelectCamera);
  const onPickLocationRef = useRef(onPickLocation);
  useEffect(() => {
    onDragEndRef.current = onDragEnd;
    onSelectCameraRef.current = onSelectCamera;
    onPickLocationRef.current = onPickLocation;
  });

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(getDocumentTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  function syncRegionsSource() {
    const map = mapRef.current;
    const source = map?.getSource(REGIONS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(regionsToFeatureCollection(regionsRef.current));
  }
  function syncDraftSource() {
    const map = mapRef.current;
    const source = map?.getSource(DRAFT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(draftToFeatureCollection(draftPointsRef.current));
  }

  useEffect(() => {
    if (!containerRef.current) return;
    ensurePmtilesProtocol();

    // React Strict Mode (on by default here) mounts every effect twice in
    // dev: create → cleanup → create again. If this first, thrown-away
    // map's async "style.load" resolves after its own cleanup has already
    // run, it must not be allowed to flip `mapReady` — that would gate the
    // marker-sync effect open against the *second* (real) map before that
    // map's own style has actually finished loading, and any interaction
    // (zoom, pan, click) in that window reads a half-initialized map.
    let cancelled = false;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildVectorStyle(getDocumentTheme()),
      center: MAP_CENTER,
      zoom: MAP_DEFAULT_ZOOM,
      maxBounds: MAP_BOUNDS,
      minZoom: 8,
      maxZoom: MAP_MAX_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    setMapMounted(true);
    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 16,
    });
    map.on("style.load", () => {
      if (cancelled) return;
      // Re-run on every style load, not just the first — `setStyle()`
      // (vector <-> satellite toggle) tears down and rebuilds the whole
      // style, wiping any sources/layers added imperatively like these.
      ensureRegionLayers(map);
      syncRegionsSource();
      syncDraftSource();
      setMapReady(true);
    });

    // Without this, MapLibre's internal canvas size falls out of sync
    // whenever the container is resized by layout (sidebar/panel reflow,
    // window resize, fullscreen toggle) — panning then moves the rendered
    // tiles based on a stale canvas size while markers reproject against
    // the actual one, so pins visibly drift away from their real position
    // the more you interact with the map.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    const markers = markersRef.current;
    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      markers.forEach((marker) => marker.remove());
      markers.clear();
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapMounted(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapMounted) return;
    map.setStyle(viewMode === "vector" ? buildVectorStyle(theme) : buildSatelliteStyle());
  }, [viewMode, theme, mapMounted]);

  // Keep the two GeoJSON sources in step with their React state — the
  // style-load handler above only covers the moment a style (re)loads;
  // this covers every change afterward (a region saved/deleted, or a new
  // point added while actively drawing).
  useEffect(() => {
    if (!mapReady) return;
    syncRegionsSource();
  }, [regions, mapReady]);
  useEffect(() => {
    if (!mapReady) return;
    syncDraftSource();
  }, [draftPoints, mapReady]);

  // Click handling, by priority: drawing a region takes over the map's
  // clicks entirely while active; otherwise, placing a camera; otherwise,
  // a click on open map (not on a marker — marker clicks stop propagation
  // before this fires) just dismisses whichever camera's info popup is open.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    function handleClick(event: maplibregl.MapMouseEvent) {
      if (drawMode) {
        setDraftPoints((prev) => [...prev, [event.lngLat.lng, event.lngLat.lat]]);
        return;
      }
      if (placementCameraId) {
        pendingPositionRef.current.set(placementCameraId, [event.lngLat.lng, event.lngLat.lat]);
        onPickLocationRef.current(event.lngLat.lat, event.lngLat.lng);
        return;
      }
      popupRef.current?.remove();
      activePopupRef.current = null;
    }
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [placementCameraId, drawMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = placementCameraId || drawMode ? "crosshair" : "";
  }, [placementCameraId, drawMode]);

  // Click a saved region to delete it — a small popup with a Delete button,
  // distinct from the camera-info `popupRef` (a fresh Popup per click here,
  // since regions don't need the same reuse-and-reposition treatment
  // markers get).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    function handleRegionClick(event: maplibregl.MapLayerMouseEvent) {
      // The general map click handler above fires for this same click too
      // (drawing a new point, or placing a camera) — don't also pop open a
      // delete popup while either of those is the actual intent.
      if (drawMode || placementCameraId) return;
      const feature = event.features?.[0];
      const id = feature?.properties?.id as string | undefined;
      const name = (feature?.properties?.name as string | undefined) ?? "Region";
      if (!id || !map) return;

      const regionPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 8 });
      const container = document.createElement("div");
      container.style.cssText = "font:12px/1.4 inherit;min-width:120px;";
      const title = document.createElement("div");
      title.style.cssText = "font-weight:600;margin-bottom:8px;";
      title.textContent = name;
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Delete Region";
      deleteButton.style.cssText =
        "padding:4px 10px;border-radius:6px;border:1px solid #ef4444;color:#ef4444;background:transparent;font-size:12px;cursor:pointer;width:100%;";
      deleteButton.onclick = () => {
        deleteRegion.mutate(id);
        regionPopup.remove();
      };
      container.appendChild(title);
      container.appendChild(deleteButton);
      regionPopup.setLngLat(event.lngLat).setDOMContent(container).addTo(map);
    }
    function handleMouseEnter() {
      if (!map) return;
      map.getCanvas().style.cursor = "pointer";
    }
    function handleMouseLeave() {
      if (!map) return;
      map.getCanvas().style.cursor = placementCameraId || drawMode ? "crosshair" : "";
    }

    map.on("click", "user-regions-fill", handleRegionClick);
    map.on("mouseenter", "user-regions-fill", handleMouseEnter);
    map.on("mouseleave", "user-regions-fill", handleMouseLeave);
    return () => {
      map.off("click", "user-regions-fill", handleRegionClick);
      map.off("mouseenter", "user-regions-fill", handleMouseEnter);
      map.off("mouseleave", "user-regions-fill", handleMouseLeave);
    };
  }, [mapReady, deleteRegion, placementCameraId, drawMode]);

  // Sync markers incrementally: add/remove only the cameras that actually
  // appeared/disappeared, and update position + style on existing marker
  // instances in place. Recreating every marker on each poll tick or click
  // (as a naive rebuild-from-scratch would) makes pins visibly snap/flicker
  // even when their real position hasn't changed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const markers = markersRef.current;
    const nextIds = new Set(placedCameras.map((c) => c.cameraId));

    markers.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        markers.delete(id);
        cameraDataRef.current.delete(id);
        if (activePopupRef.current?.cameraId === id) {
          popupRef.current?.remove();
          activePopupRef.current = null;
        }
      }
    });

    placedCameras.forEach((camera) => {
      // Always refresh so the hover handler (attached once, below) reads
      // this camera's latest status/counts rather than a stale snapshot
      // from whenever its marker element was first created.
      cameraDataRef.current.set(camera.cameraId, camera);
      // Patches the already-open popup's stat numbers in place — does NOT
      // re-fetch or rebuild the frame image, so a poll tick never spams
      // the detection API just to refresh a live-count digit.
      if (activePopupRef.current?.cameraId === camera.cameraId && popupRef.current?.isOpen()) {
        applyPopupStats(activePopupRef.current, camera);
      }

      const selected = camera.cameraId === selectedCameraId;
      const placing = camera.cameraId === placementCameraId;
      let lngLat: [number, number] = [camera.longitude as number, camera.latitude as number];

      const pending = pendingPositionRef.current.get(camera.cameraId);
      if (pending) {
        const confirmed =
          Math.abs(pending[0] - lngLat[0]) < 1e-6 && Math.abs(pending[1] - lngLat[1]) < 1e-6;
        if (confirmed) {
          pendingPositionRef.current.delete(camera.cameraId);
        } else {
          // The backend hasn't echoed the just-saved position back yet —
          // keep showing where the user actually put it, not stale data.
          lngLat = pending;
        }
      }

      const existing = markers.get(camera.cameraId);
      if (existing) {
        if (!draggingRef.current.has(camera.cameraId)) {
          existing.setLngLat(lngLat);
        }
        // Only the camera currently armed for placement can be dragged —
        // every other pin is fixed and only responds to clicks (select).
        existing.setDraggable(placing);
        applyMarkerStyle(existing.getElement() as HTMLButtonElement, camera, selected, placing);
        return;
      }

      const el = createMarkerElement(camera);
      applyMarkerStyle(el, camera, selected, placing);
      // Looked up fresh from cameraDataRef (kept up to date above on every
      // sync pass) rather than closing over `camera` directly — this marker
      // element is reused across renders, so a closure over `camera` would
      // keep showing whatever status/counts existed the moment this pin was
      // first created.
      const cameraId = camera.cameraId;
      el.onclick = (event) => {
        event.stopPropagation();
        onSelectCameraRef.current(cameraId);

        const currentMap = mapRef.current;
        const latest = cameraDataRef.current.get(cameraId);
        const popup = popupRef.current;
        if (!currentMap || !popup || !latest || latest.latitude === null || latest.longitude === null) {
          return;
        }
        // Clicking the same camera again closes its popup instead of
        // re-opening it — a simple toggle, same as most map UIs.
        if (activePopupRef.current?.cameraId === cameraId && popup.isOpen()) {
          popup.remove();
          activePopupRef.current = null;
          return;
        }

        const { element, refs } = buildPopupContent(latest);
        activePopupRef.current = refs;
        popup.setLngLat([latest.longitude, latest.latitude]).setDOMContent(element).addTo(currentMap);

        fetchCameraLatestFrame(latest.cameraId)
          .then((data) => {
            // The popup may have closed or switched to a different camera
            // by the time this resolves — only paint into it if it's still
            // the one currently showing.
            if (activePopupRef.current !== refs) return;
            if (data) renderPopupFrame(refs.frameSlot, data);
            else renderPopupFrameEmpty(refs.frameSlot, "No recent frame available for this camera");
          })
          .catch(() => {
            if (activePopupRef.current !== refs) return;
            renderPopupFrameEmpty(refs.frameSlot, "No recent frame available for this camera");
          });
      };
      const marker = new maplibregl.Marker({ element: el, anchor: "center", draggable: placing })
        .setLngLat(lngLat)
        .addTo(map);
      marker.on("dragstart", () => {
        draggingRef.current.add(camera.cameraId);
      });
      marker.on("dragend", () => {
        draggingRef.current.delete(camera.cameraId);
        const { lat, lng } = marker.getLngLat();
        pendingPositionRef.current.set(camera.cameraId, [lng, lat]);
        onDragEndRef.current(camera.cameraId, lat, lng);
      });
      markers.set(camera.cameraId, marker);
    });
  }, [placedCameras, selectedCameraId, placementCameraId, mapMounted, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapMounted || !flyToTarget) return;
    // Selecting a camera swaps the side panel's content (list → detail
    // form) in this same render, which can change the map container's own
    // height right now. The ResizeObserver above picks that up
    // asynchronously, so without forcing a resize here first, flyTo can
    // compute its target against the container's stale pre-swap size and
    // land the marker below the container's actual (now shorter) bottom
    // edge — outside the visible, clipped area.
    map.resize();
    map.flyTo({ center: flyToTarget.center, zoom: flyToTarget.zoom, duration: 700 });
  }, [flyToTarget, mapMounted]);

  // Auto-fit to the real cameras once, on initial load — many camera
  // registries seed all cameras within a few hundred meters of each other,
  // where the default city-wide zoom would render every marker as a single
  // overlapping, unclickable pixel.
  const hasAutoFitRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapMounted || hasAutoFitRef.current || placedCameras.length === 0) return;
    hasAutoFitRef.current = true;

    if (placedCameras.length === 1) {
      const only = placedCameras[0];
      map.jumpTo({ center: [only.longitude as number, only.latitude as number], zoom: 16 });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    placedCameras.forEach((camera) => {
      bounds.extend([camera.longitude as number, camera.latitude as number]);
    });
    map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 0 });
  }, [placedCameras, mapMounted]);

  function handleZoomIn() {
    mapRef.current?.zoomIn({ duration: 200 });
  }
  function handleZoomOut() {
    mapRef.current?.zoomOut({ duration: 200 });
  }
  function handleLocate() {
    mapRef.current?.flyTo({ center: MAP_CENTER, zoom: MAP_DEFAULT_ZOOM, duration: 600 });
  }
  function handleFullscreen() {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  function handleToggleDrawMode() {
    if (drawMode) {
      setDrawMode(false);
      setDraftPoints([]);
    } else {
      setDrawMode(true);
      setDraftPoints([]);
    }
  }
  function handleUndoLastPoint() {
    setDraftPoints((prev) => prev.slice(0, -1));
  }
  function handleFinishDraw() {
    if (draftPoints.length < 3) return;
    setShowSaveModal(true);
  }
  function handleSaveRegion(name: string, color: string) {
    createRegion.mutate(
      { name, color, coordinates: draftPoints },
      {
        onSuccess: () => {
          setShowSaveModal(false);
          setDrawMode(false);
          setDraftPoints([]);
        },
      }
    );
  }

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-xl", className)}>
      <div ref={containerRef} className="h-full w-full bg-[#0a0e17]" />
      {!mapReady && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md border border-surface-border bg-surface-2/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          Loading map tiles…
        </div>
      )}
      {placementCameraId && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md border border-primary bg-surface-2/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          Click anywhere on the map to place this camera
        </div>
      )}
      {drawMode && !placementCameraId && (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-primary bg-surface-2/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          <span>
            Click the map to add points ({draftPoints.length} placed
            {draftPoints.length < 3 ? `, need ${3 - draftPoints.length} more` : ""})
          </span>
          <button
            type="button"
            onClick={handleUndoLastPoint}
            disabled={draftPoints.length === 0}
            aria-label="Undo last point"
            className="flex size-6 items-center justify-center rounded hover:bg-surface-3 disabled:opacity-40"
          >
            <Undo2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleFinishDraw}
            disabled={draftPoints.length < 3}
            className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-40"
          >
            Finish
          </button>
          <button
            type="button"
            onClick={handleToggleDrawMode}
            aria-label="Cancel drawing"
            className="flex size-6 items-center justify-center rounded hover:bg-surface-3"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <div className="absolute left-4 top-4 z-10">
        <button
          type="button"
          onClick={handleToggleDrawMode}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur",
            drawMode
              ? "border-primary bg-primary/15 text-primary"
              : "border-surface-border bg-surface-2/95 hover:bg-surface-3"
          )}
        >
          <PenLine className="size-3.5" /> {drawMode ? "Drawing…" : "Draw Region"}
        </button>
      </div>
      <SaveRegionModal
        open={showSaveModal}
        pointCount={draftPoints.length}
        onCancel={() => setShowSaveModal(false)}
        onSave={handleSaveRegion}
        isSaving={createRegion.isPending}
        error={createRegion.error?.message ?? null}
      />
      <MapLayerToggle viewMode={viewMode} onChange={setViewMode} />
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
        <div className="flex flex-col overflow-hidden rounded-md border border-surface-border bg-surface-2/95 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            className="flex size-9 items-center justify-center border-b border-surface-border hover:bg-surface-3"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            className="flex size-9 items-center justify-center hover:bg-surface-3"
          >
            <Minus className="size-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleLocate}
          aria-label="Recenter"
          className="flex size-9 items-center justify-center rounded-md border border-surface-border bg-surface-2/95 shadow-sm backdrop-blur hover:bg-surface-3"
        >
          <Crosshair className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleFullscreen}
          aria-label="Fullscreen"
          className="flex size-9 items-center justify-center rounded-md border border-surface-border bg-surface-2/95 shadow-sm backdrop-blur hover:bg-surface-3"
        >
          <Expand className="size-4" />
        </button>
      </div>
    </div>
  );
}
