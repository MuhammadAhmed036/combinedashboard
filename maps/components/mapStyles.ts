import type { StyleSpecification } from "maplibre-gl";

/**
 * Covers both offline regions bundled under `public/maps/` — Islamabad's own
 * bbox ([72.7,33.45]–[73.4,33.95]) sits entirely inside Rawalpindi District's
 * bbox, so the combined coverage area is exactly Rawalpindi's bounding box.
 */
export const MAP_CENTER: [number, number] = [73.0917, 33.5421];
export const MAP_DEFAULT_ZOOM = 10;
// Shared with the click-to-select fly-to targets so "go to this camera"
// always lands at the map's actual max zoom, not some other hardcoded value
// that drifts out of sync with it.
export const MAP_MAX_ZOOM = 18;
export const MAP_BOUNDS: [[number, number], [number, number]] = [
  [72.582, 33.022],
  [73.601, 34.062],
];

const GLYPHS_URL = "/map-fonts/{fontstack}/{range}.pbf";

export type MapTheme = "dark" | "light";

interface RegionConfig {
  /** Suffix applied to every source/layer id so both regions' tiles can coexist in one style. */
  id: string;
  vectorTilesUrl: string;
  satelliteTilesUrl: string;
}

// Both packages were clipped from the same parent Pakistan-wide OpenMapTiles
// source, so they share one schema (same source-layers: water, landuse,
// building, transportation, transportation_name, boundary, place) — the
// exact same layer paint/filter rules below apply to both unmodified.
const REGIONS: RegionConfig[] = [
  {
    id: "islamabad",
    vectorTilesUrl: "pmtiles:///maps/islamabad.pmtiles",
    satelliteTilesUrl: "pmtiles:///maps/islamabad-satellite.pmtiles",
  },
  {
    id: "rawalpindi",
    vectorTilesUrl: "pmtiles:///maps/rawalpindi.pmtiles",
    satelliteTilesUrl: "pmtiles:///maps/rawalpindi-satellite.pmtiles",
  },
];

interface VectorPalette {
  bg: string;
  water: string;
  landuse: string;
  park: string;
  building: string;
  roadCasing: string;
  boundary: string;
  labelText: string;
  labelHalo: string;
  roadLabel: string;
  residentialRoad: string;
  defaultRoad: string;
}

const MAJOR_PLACE_CLASSES = ["city", "town"];
const MINOR_PLACE_CLASSES = [
  "village",
  "suburb",
  "quarter",
  "neighbourhood",
  "hamlet",
  "isolated_dwelling",
];

// Ported from islamabad_map_package/index.html's place-label tiering, which
// keeps important place names visible at low zoom and reveals minor ones
// only once there's room (avoids MapLibre's collision detection silently
// dropping overlapping labels).
function placeLabelLayers(
  region: RegionConfig,
  textColor: string,
  haloColor: string
): StyleSpecification["layers"] {
  return [
    {
      id: `place-label-major-${region.id}`,
      type: "symbol",
      source: `openmaptiles_${region.id}`,
      "source-layer": "place",
      filter: ["in", ["get", "class"], ["literal", MAJOR_PLACE_CLASSES]],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 13, 14, 20],
        "text-max-width": 10,
        "symbol-sort-key": ["coalesce", ["get", "rank"], 0],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": textColor,
        "text-halo-color": haloColor,
        "text-halo-width": 2,
      },
    },
    {
      id: `place-label-minor-${region.id}`,
      type: "symbol",
      source: `openmaptiles_${region.id}`,
      "source-layer": "place",
      filter: ["in", ["get", "class"], ["literal", MINOR_PLACE_CLASSES]],
      minzoom: 11,
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 16, 16],
        "text-max-width": 9,
        "symbol-sort-key": ["coalesce", ["get", "rank"], 10],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": textColor,
        "text-halo-color": haloColor,
        "text-halo-width": 1.5,
      },
    },
  ] as StyleSpecification["layers"];
}

// One "row" per original layer, each containing that layer instantiated for
// every region — grouped this way (rather than all-of-region-A-then-all-of-
// region-B) so z-ordering between layer *types* stays correct regardless of
// how the two regions' geometry relates to each other on screen.
function vectorLayerRows(region: RegionConfig, palette: VectorPalette): StyleSpecification["layers"][] {
  const source = `openmaptiles_${region.id}`;
  return [
    [
      {
        id: `water-${region.id}`,
        type: "fill",
        source,
        "source-layer": "water",
        paint: { "fill-color": palette.water, "fill-opacity": 0.85 },
      },
    ],
    [
      {
        id: `landuse-${region.id}`,
        type: "fill",
        source,
        "source-layer": "landuse",
        paint: { "fill-color": palette.landuse, "fill-opacity": 0.35 },
      },
    ],
    [
      {
        id: `park-${region.id}`,
        type: "fill",
        source,
        "source-layer": "landuse",
        filter: ["in", ["get", "class"], ["literal", ["park", "recreation_ground", "grass"]]],
        paint: { "fill-color": palette.park, "fill-opacity": 0.55 },
      },
    ],
    [
      {
        id: `building-${region.id}`,
        type: "fill",
        source,
        "source-layer": "building",
        paint: { "fill-color": palette.building, "fill-opacity": 0.55 },
      },
    ],
    [
      {
        id: `road-casing-${region.id}`,
        type: "line",
        source,
        "source-layer": "transportation",
        paint: {
          "line-color": palette.roadCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 14, 5],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      },
    ],
    [
      {
        id: `road-fill-${region.id}`,
        type: "line",
        source,
        "source-layer": "transportation",
        paint: {
          "line-color": [
            "match",
            ["get", "class"],
            "motorway",
            "#dc2626",
            "trunk",
            "#ea580c",
            "primary",
            "#d97706",
            "secondary",
            "#ca8a04",
            "residential",
            palette.residentialRoad,
            palette.defaultRoad,
          ],
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.3, 14, 4],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      },
    ],
    [
      {
        id: `boundary-${region.id}`,
        type: "line",
        source,
        "source-layer": "boundary",
        paint: { "line-color": palette.boundary, "line-width": 1 },
      },
    ],
    [
      {
        id: `road-label-${region.id}`,
        type: "symbol",
        source,
        "source-layer": "transportation_name",
        minzoom: 12,
        layout: {
          "symbol-placement": "line",
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13],
        },
        paint: {
          "text-color": palette.roadLabel,
          "text-halo-color": palette.labelHalo,
          "text-halo-width": 1.5,
        },
      },
    ],
  ] as StyleSpecification["layers"][];
}

function interleaveByRow(perRegionRows: StyleSpecification["layers"][][]): StyleSpecification["layers"] {
  const rowCount = perRegionRows[0]?.length ?? 0;
  const layers: StyleSpecification["layers"] = [];
  for (let row = 0; row < rowCount; row++) {
    for (const regionRows of perRegionRows) {
      layers.push(...regionRows[row]);
    }
  }
  return layers;
}

function vectorSources(): StyleSpecification["sources"] {
  return Object.fromEntries(
    REGIONS.map((region) => [
      `openmaptiles_${region.id}`,
      { type: "vector" as const, url: region.vectorTilesUrl, maxzoom: 14 },
    ])
  );
}

export function buildVectorStyle(theme: MapTheme = "dark"): StyleSpecification {
  const palette: VectorPalette =
    theme === "light"
      ? {
          bg: "#e9eef6",
          water: "#b9d9ee",
          landuse: "#dce5dc",
          park: "#c9e2c6",
          building: "#d5dde8",
          roadCasing: "#f8fafc",
          boundary: "#94a3b8",
          labelText: "#24324a",
          labelHalo: "#f8fafc",
          roadLabel: "#475569",
          residentialRoad: "#a8b3c3",
          defaultRoad: "#8d9bad",
        }
      : {
          bg: "#0a0e17",
          water: "#13283f",
          landuse: "#10182a",
          park: "#10241a",
          building: "#1a2336",
          roadCasing: "#05070d",
          boundary: "#374151",
          labelText: "#e5e7eb",
          labelHalo: "#0a0e17",
          roadLabel: "#cbd5e1",
          residentialRoad: "#4b5563",
          defaultRoad: "#374151",
        };

  const regionLayers = interleaveByRow(REGIONS.map((region) => vectorLayerRows(region, palette)));
  const labelLayers = REGIONS.flatMap((region) =>
    placeLabelLayers(region, palette.labelText, palette.labelHalo)
  );

  return {
    version: 8,
    name: "Intellivision Islamabad + Rawalpindi Vector",
    glyphs: GLYPHS_URL,
    transition: { duration: 0, delay: 0 },
    sources: vectorSources(),
    layers: [
      { id: "background", type: "background", paint: { "background-color": palette.bg } },
      ...regionLayers,
      ...labelLayers,
    ] as StyleSpecification["layers"],
  };
}

export function buildSatelliteStyle(): StyleSpecification {
  const labelText = "#ffffff";
  const labelHalo = "#000000";

  const sources: StyleSpecification["sources"] = {
    ...Object.fromEntries(
      REGIONS.map((region) => [
        `satellite_${region.id}`,
        { type: "raster" as const, url: region.satelliteTilesUrl, tileSize: 256, minzoom: 0, maxzoom: 14 },
      ])
    ),
    ...vectorSources(),
  };

  const satelliteLayers = REGIONS.map((region) => ({
    id: `satellite-${region.id}`,
    type: "raster" as const,
    source: `satellite_${region.id}`,
    paint: { "raster-opacity": 1, "raster-brightness-min": 0 },
  }));

  const roadLayers = REGIONS.map((region) => ({
    id: `road-satellite-${region.id}`,
    type: "line" as const,
    source: `openmaptiles_${region.id}`,
    "source-layer": "transportation",
    paint: {
      "line-color": [
        "match",
        ["get", "class"],
        "motorway",
        "#f59e0b",
        "trunk",
        "#f59e0b",
        "primary",
        "#ffffff",
        "#aaaaaa",
      ],
      "line-opacity": 0.7,
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 14, 3],
    },
    layout: { "line-cap": "round", "line-join": "round" },
  }));

  const labelLayers = REGIONS.flatMap((region) => placeLabelLayers(region, labelText, labelHalo));

  return {
    version: 8,
    name: "Intellivision Islamabad + Rawalpindi Satellite",
    glyphs: GLYPHS_URL,
    transition: { duration: 0, delay: 0 },
    sources,
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#000" } },
      ...satelliteLayers,
      ...roadLayers,
      ...labelLayers,
    ] as StyleSpecification["layers"],
  };
}
