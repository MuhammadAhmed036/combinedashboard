# API Reference

All routes are first-party dashboard APIs implemented under `apis/api/`. In the current codebase there is no dashboard user-auth middleware on these routes. Upstream services may require credentials through environment variables.

Common environment:

- `DATABASE_URL` - local dashboard database.
- `DETECTION_API_BASE_URL` - upstream detection/AI API for `/api/ai/*`.
- `STREAMS_API_URL`, `STREAMS_API_USERNAME`, `STREAMS_API_PASSWORD` - camera stream registry.
- `CAMERA_FEED_BASE_URL`, `CAMERA_FEED_USERNAME`, `CAMERA_FEED_PASSWORD` - camera frame proxy.
- `PERSON_COUNT_WS_URL` - browser WebSocket URL returned by runtime config.

## Alerts

### `GET /api/alerts`

Query: `status`, `seen=true|false`, `camera_id`, `zone`, `q`, `limit`.

Response:

```json
{ "alerts": [{ "alert_id": "...", "camera_id": "...", "name": "...", "status": "active", "seen": false, "event_count": 0 }] }
```

Example:

```bash
curl "http://localhost:3000/api/alerts?status=active&seen=false"
```

### `POST /api/alerts`

Creates an alert rule.

Request:

```json
{
  "camera_id": "CAM-01",
  "zone": "Entrance",
  "name": "Gate ROI",
  "label": "Person, Car",
  "description": "Optional",
  "source_event_id": "event-uuid",
  "bounding_box": { "x1": 100, "y1": 120, "x2": 600, "y2": 500 },
  "conditions": {
    "condition": "boundary",
    "trigger_inside": true,
    "trigger_outside": false,
    "class_names": ["person", "car"]
  },
  "metadata": { "ref_image_width": 1920, "ref_image_height": 1080 },
  "status": "active",
  "created_by": "operator"
}
```

Absence request:

```json
{
  "camera_id": "CAM-01",
  "name": "No person at checkpost",
  "label": "person",
  "conditions": { "condition": "absence", "absence_threshold_seconds": 300 },
  "metadata": {},
  "status": "active"
}
```

Response: created alert row.

### `GET /api/alerts/stats`

Response:

```json
{ "total": 10, "seen": 7, "unseen": 3, "byStatus": { "active": 8, "muted": 2 } }
```

### `GET /api/alerts/:alertId`

Response: alert row with `event_count`, or `404`.

### `PATCH /api/alerts/:alertId`

Request:

```json
{ "status": "active" }
```

Response: updated alert row.

### `DELETE /api/alerts/:alertId`

Deletes alert and child events.

Response:

```json
{ "ok": true }
```

### `POST /api/alerts/:alertId/seen`

Request:

```json
{ "seen": true, "user": "operator" }
```

Response: updated alert row.

### `GET /api/alerts/:alertId/events`

Query: `limit`.

Response:

```json
{ "events": [{ "alert_id": "...", "event_id": "...", "seen": false, "is_latest": true }] }
```

### `POST /api/alerts/:alertId/events`

Creates an alert event manually or from an evaluator.

Request:

```json
{
  "event_id": "event-uuid",
  "detection_ts": "2026-09-24T10:00:00Z",
  "person_count_inside": 1,
  "person_count_outside": 0,
  "bounding_box": { "x1": 100, "y1": 120, "x2": 600, "y2": 500 },
  "detections_json": { "inside": { "person": 1 }, "outside": {} },
  "note": "server-detection-engine",
  "created_by": "worker"
}
```

Response: inserted or existing alert event.

### `GET /api/alerts/:alertId/absence-events`

Query: `limit`, `day`.

Response includes absence history and daily summary:

```json
{
  "events": [{ "alert_id": "...", "started_at": "...", "ended_at": null, "duration_seconds": null }],
  "dailySummary": { "absent_seconds": 600, "absence_events": 2 }
}
```

## Cameras And Media Wall

### `GET /api/stream-cameras`

Proxies the configured streams API.

Response: camera stream list used by media wall and camera pages.

### `GET /api/camera-feed/:cameraName`

Proxies a live camera frame/feed from `CAMERA_FEED_BASE_URL`.

Response: upstream media response.

### `GET /api/cameras`

Query: `limit`.

Response:

```json
{ "cameras": [{ "camera_id": "CAM-01", "camera_name": "Gate", "latitude": 33.6, "longitude": 73.0 }] }
```

### `POST /api/cameras`

Creates or places a camera in local registry.

Request:

```json
{ "camera_id": "CAM-01", "camera_name": "Gate", "zone": "Entrance", "latitude": 33.6, "longitude": 73.0 }
```

Response: camera row.

### `GET /api/cameras/:cameraId`

Response: camera row or `404`.

### `PATCH /api/cameras/:cameraId`

Request:

```json
{ "latitude": 33.6, "longitude": 73.0 }
```

Response: updated camera row.

### `GET /api/cameras/:cameraId/classes`

Returns distinct recent detection classes for dynamic alert creation.

Response:

```json
{ "classNames": ["person", "car", "truck", "bike"] }
```

### `GET /api/cameras/:cameraId/people-count-series`

Query: `from`, `to`, `bucket=5m`, `mode=max|latest`.

Response:

```json
{ "series": [{ "time": "2026-09-24T10:00:00.000Z", "people_count": 5, "event_count": 12 }] }
```

### `POST /api/cameras/sync`

Upserts cameras seen in local mirrored detections into `camera_locations`.

Response:

```json
{ "added": 2, "before": 20, "after": 22 }
```

## Events And Stats

### `GET /api/events`

Query: `camera_id`, `limit`, date/range filters supported by the route/store.

Response: detection events list.

### `GET /api/events/:eventId`

Response: one detection event, including detections JSON and image metadata.

### `GET /api/stats`

Response: dashboard stats from local mirrored detections/alerts.

### `GET /api/stats/classes`

Response: detection class totals.

### `GET /api/stats/classes/by-camera`

Response: detection class totals grouped by camera.

### `GET /api/stats/classes/density-last-hour`

Response: class density for the last hour.

### `GET /api/stats/classes/series`

Query: time range/bucket filters.

Response: class trend series.

### `GET /api/camera-retention`

Response: raw image retention/remaining-to-target metrics based on local event mirror.

## Map

### `GET /api/map-regions`

Response:

```json
[{ "id": "...", "name": "Area A", "color": "#3b82f6", "coordinates": [[73.0, 33.6]] }]
```

### `POST /api/map-regions`

Request:

```json
{ "name": "Area A", "color": "#3b82f6", "coordinates": [[73.0, 33.6], [73.1, 33.6], [73.1, 33.7]] }
```

Response: saved region.

### `DELETE /api/map-regions/:id`

Response:

```json
{ "ok": true }
```

## Runtime And Proxy

### `GET /api/runtime-config`

Response:

```json
{ "detectionApiBase": "http://host:18088", "personCountWsBase": "ws://host:8090", "pollIntervalMs": 5000 }
```

### `/api/ai/*`

Proxy to `DETECTION_API_BASE_URL`. Used for detection details/latest frames without hardcoding third-party URLs into the browser.

## WebSocket

Connect to `PERSON_COUNT_WS_URL`.

Message:

```json
{
  "type": "people_count",
  "camera_id": "CAM-01",
  "camera_name": "Gate Camera",
  "zone": "Entrance",
  "people_count": 3,
  "event_id": "event-uuid",
  "time": "2026-09-24T10:00:00.000Z"
}
```

Client reconnect is implemented in `frontend/src/lib/allCamerasFeed.ts`.
