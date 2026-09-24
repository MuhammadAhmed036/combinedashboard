"use client";

import { loadRuntimeConfig } from "@/lib/runtimeConfig";

type FeedListener = (message: Record<string, unknown>) => void;

const RECONNECT_MS = 5000;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<FeedListener>();
let manuallyClosed = false;
let socketOpen = false;

// Synthetic message announcing the shared socket's open/closed state, so
// per-camera consumers can render a "Live"/"Connecting…" indicator without
// each opening their own connection. Real `people_count` consumers already
// bail on any `type !== "people_count"`, so this is inert for them.
function notifyConnection(connected: boolean) {
  socketOpen = connected;
  listeners.forEach((listener) => listener({ type: "__connection", connected }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function connect() {
  const { personCountWsBase } = await loadRuntimeConfig();
  // A subscriber can unsubscribe (or another connect() can already have run)
  // while this fetch was in flight — re-check before opening a socket.
  if (manuallyClosed || listeners.size === 0 || !personCountWsBase) return;

  socket = new WebSocket(personCountWsBase);

  socket.onopen = () => {
    notifyConnection(true);
  };

  socket.onmessage = (event) => {
    let data: Record<string, unknown>;
    try {
      data = asRecord(JSON.parse(event.data));
    } catch {
      return;
    }
    listeners.forEach((listener) => listener(data));
  };

  socket.onclose = () => {
    notifyConnection(false);
    if (manuallyClosed) return;
    reconnectTimer = setTimeout(() => {
      void connect();
    }, RECONNECT_MS);
  };

  socket.onerror = () => {
    socket?.close();
  };
}

/**
 * Shared subscription to the person-count-ws service (`PERSON_COUNT_WS_URL`)
 * — one real WebSocket connection regardless of how many consumers subscribe
 * (the alert watcher, live occupancy tracking, etc.). Previously each
 * consumer opened its own connection to this same feed, doubling traffic and
 * message-driven re-renders on any page using more than one of them at once.
 */
export function subscribeToAllCamerasFeed(listener: FeedListener): () => void {
  if (listeners.size === 0) {
    manuallyClosed = false;
    void connect();
  }
  listeners.add(listener);
  // A late subscriber (socket already open) missed the `onopen` broadcast —
  // hand it the current state right away.
  if (socketOpen) listener({ type: "__connection", connected: true });

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      manuallyClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
      socketOpen = false;
    }
  };
}
