# Islamabad Map Package

Offline map of Islamabad Capital Territory using **MapLibre GL** + **PMTiles**.
No internet required — all map data is local.

---

## Folder Structure

```
islamabad_map_package/
├── index.html                      ← Main map page
├── maplibre-gl.js                  ← Map rendering engine
├── maplibre-gl.css                 ← Map styles
├── pmtiles.js                      ← PMTiles protocol handler
├── maps/
│   ├── islamabad.pmtiles           ← Vector map data (roads, buildings, labels)
│   ├── islamabad-satellite.pmtiles ← Satellite imagery
│   └── islamabad.geojson           ← Islamabad boundary polygon
└── fonts/
    ├── Noto Sans Bold/             ← Font for place labels
    └── Noto Sans Regular/          ← Font for road labels
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
   cd "path\to\islamabad_map_package"
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

1. Open the `islamabad_map_package` folder in VS Code
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
| **Bounds** | Locked to Islamabad Capital Territory |

---

## Map Coverage

- **Area:** Islamabad Capital Territory (ICT)
- **Bounding Box:** 72.7°E to 73.4°E, 33.45°N to 33.95°N
- **Center:** 73.0479°E, 33.7295°N (F-7 area)
- **Zoom range:** 9 (city view) to 18 (street level)
- **Max zoom in data:** Zoom level 14

---

## Integrating into Your Own Project

Copy these files into your project's `public/` folder (or static assets folder):

```
maps/islamabad.pmtiles
maps/islamabad-satellite.pmtiles
maps/islamabad.geojson
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
      center: [73.0479, 33.7295],  // Islamabad center
      zoom: 11,
      style: {
        version: 8,
        glyphs: "fonts/{fontstack}/{range}.pbf",
        sources: {
          openmaptiles: {
            type: "vector",
            url: "pmtiles://maps/islamabad.pmtiles",
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
| Map not centered on Islamabad | Check that `center: [73.0479, 33.7295]` is set in your code |
| Satellite view is black | The server must serve `.pmtiles` files with byte-range support — `npx serve` supports this |

---

## Data Sources

| Data | Source |
|------|--------|
| Vector tiles | Extracted from OpenMapTiles Pakistan dataset |
| Satellite imagery | Extracted from Pakistan satellite PMTiles |
| Boundary | Islamabad Capital Territory approximate polygon |
| Fonts | Noto Sans (Google Fonts, OFL license) |

---

## License

Map data is based on **OpenStreetMap** contributors.
Tile rendering via **MapLibre GL JS** (BSD-3 license).
PMTiles format by **Protomaps** (BSD license).
