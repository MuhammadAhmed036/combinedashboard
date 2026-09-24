# Rawalpindi Map Package

Offline map of Rawalpindi District using **MapLibre GL** + **PMTiles**.
No internet required — all map data is local.

---

## Folder Structure

```
rawalpindi_map_package/
├── index.html                       ← Main map page
├── maplibre-gl.js                   ← Map rendering engine
├── maplibre-gl.css                  ← Map styles
├── pmtiles.js                       ← PMTiles protocol handler
├── maps/
│   ├── rawalpindi.pmtiles           ← Vector map data (roads, buildings, labels)
│   ├── rawalpindi-satellite.pmtiles ← Satellite imagery
│   └── rawalpindi.geojson           ← Rawalpindi District boundary polygon
└── fonts/
    ├── Noto Sans Bold/              ← Font for place labels
    └── Noto Sans Regular/           ← Font for road labels
```

---

## How to Run

> **Important:** You cannot open `index.html` directly by double-clicking.
> PMTiles files require an HTTP server to load. Follow one of the methods below.

---

### Method 1 — Node.js `serve` (Recommended)

**Requirement:** Node.js installed ([nodejs.org](https://nodejs.org))

1. Open a terminal (PowerShell or Command Prompt)
2. Navigate to the folder:
   ```
   cd "path\to\rawalpindi_map_package"
   ```
3. Run the server:
   ```
   npx serve . --listen 5500
   ```
4. Open your browser and go to:
   ```
   http://localhost:5500
   ```
5. Keep the terminal open while using the map. Close it to stop the server.

---

### Method 2 — VS Code Live Server

**Requirement:** [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) in VS Code

1. Open the `rawalpindi_map_package` folder in VS Code
2. Open `index.html`
3. Click **Go Live** button in the bottom-right status bar
4. Browser opens automatically at `http://127.0.0.1:5500`

---

### Method 3 — Python HTTP Server

**Requirement:** Python installed

1. Open terminal in the folder
2. Run:
   ```
   python -m http.server 5500
   ```
3. Open browser at:
   ```
   http://localhost:5500
   ```

---

## Map Features

| Feature | Details |
|---------|---------|
| **Vector Map** | Roads, buildings, parks, water, place labels |
| **Satellite View** | Aerial imagery with road overlay |
| **Toggle** | Vector Map / Satellite View buttons (top-right) |
| **Zoom** | Scroll wheel or +/- buttons (bottom-right) |
| **Pan** | Click and drag |
| **Scale** | Shown at bottom-left |
| **Bounds** | Locked to Rawalpindi District |

---

## Map Coverage

- **Area:** Rawalpindi District (Punjab), covering Rawalpindi city, Rawal Town, Taxila,
  Wah Cantt, Gujar Khan, Kahuta, Kallar Syedan, Kotli Sattian and surrounding tehsils
- **Bounding Box:** 72.582°E to 73.601°E, 33.022°N to 34.062°N
- **Center:** 73.0917°E, 33.5421°N
- **Zoom range:** 8 (district view) to 18 (street level)
- **Max zoom in vector data:** Zoom level 14
- **Max zoom in satellite data:** Zoom level 13

Tiles were clipped from the same Pakistan-wide vector/satellite PMTiles sources
using the district's exact boundary polygon (not just a bounding box), so data
just outside Rawalpindi District is excluded and every tile inside it is kept.

---

## Integrating into Your Own Project

Copy these files into your project's `public/` folder (or static assets folder):

```
maps/rawalpindi.pmtiles
maps/rawalpindi-satellite.pmtiles
maps/rawalpindi.geojson
fonts/Noto Sans Bold/
fonts/Noto Sans Regular/
maplibre-gl.js
maplibre-gl.css
pmtiles.js
```

Then copy the JavaScript from `index.html` into your page.

### Minimum HTML to get started:

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="maplibre-gl.css" />
  <style>
    #map { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="maplibre-gl.js"></script>
  <script src="pmtiles.js"></script>
  <script>
    // Register PMTiles protocol
    var protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

    // Initialize map
    var map = new maplibregl.Map({
      container: "map",
      center: [73.0917, 33.5421],  // Rawalpindi center
      zoom: 10,
      style: {
        version: 8,
        glyphs: "fonts/{fontstack}/{range}.pbf",
        sources: {
          openmaptiles: {
            type: "vector",
            url: "pmtiles://maps/rawalpindi.pmtiles",
            maxzoom: 14,
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#1a1a1a" } },
          // add more layers as needed
        ],
      },
    });
  </script>
</body>
</html>
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Map is black / not loading | You must use an HTTP server — do not open `index.html` directly as a file |
| Error in browser console about `pmtiles` | Make sure `pmtiles.js` is in the same folder as `index.html` |
| Font not loading (labels missing) | Make sure `fonts/` folder is present with both `Noto Sans Bold` and `Noto Sans Regular` subfolders |
| Map not centered on Rawalpindi | Check that `center: [73.0917, 33.5421]` is set in your code |
| Satellite view is black | The server must serve `.pmtiles` files with byte-range support — `npx serve` supports this |

---

## Data Sources

| Data | Source |
|------|--------|
| Vector tiles | Extracted from OpenMapTiles Pakistan dataset (`pakistan.pmtiles`) |
| Satellite imagery | Extracted from Pakistan satellite PMTiles (`satellite-pakistan.pmtiles`) |
| Boundary | Rawalpindi District polygon (geoBoundaries, ADM2, Pakistan — Public Domain) |
| Fonts | Noto Sans (Google Fonts, OFL license) |

---

## License

Map data is based on **OpenStreetMap** contributors.
Tile rendering via **MapLibre GL JS** (BSD-3 license).
PMTiles format by **Protomaps** (BSD license).
Boundary data from **geoBoundaries** (Public Domain).
