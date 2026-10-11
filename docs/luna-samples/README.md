# LUNA payload samples

Real responses from the configured LUNA PLATFORM 5, captured 2026-10-11 with read-only GETs (server-side, `.env`
credentials). `account_id` values and any `user:password@` in URLs are masked. Field map: `AUDIT_PIPELINE_INTEGRATION.md` §13.

| File | Source | Used by |
|---|---|---|
| `history-events.sample.json` | `GET /6/events` (same data as the gateway `GET /api/lp5/6/events` the History tab calls) — 8 events chosen to cover each case (`_case`) | card mapping + unit tests |
| `handlers.sample.json` | `GET /6/handlers`, trimmed to `description` + `match_policy` (label → list_id) | list-name resolution |
| `lists.sample.json` | `GET /6/lists` | list-name resolution |
| `streams.sample.json` | `GET <gateway>/api/luna-streams/1/streams`, trimmed; RTSP credentials masked | camera-name resolution |
| `face.sample.json` | `GET /6/faces/<face_id>` | reference avatar (existing) |

## Live WebSocket

Not captured: a 90 s subscription through the `luna-ws` relay (`ws://<host>:LUNA_WS_PORT` → `ws://<LUNA_HOST>:<LUNA_API_PORT>/6/ws`)
received 0 messages on 2026-10-11 — all three LUNA streams were in `status: failure` and no events had been created since
2026-10-09. The panel merges `GET /events/<event_id>` into every Live event, so Live cards use the same shape as these samples.
