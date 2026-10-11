'use client';

import { useState, useEffect } from 'react';

interface StreamEntry {
  sourceName: string;
  stream: MediaStream | null;
  pc: RTCPeerConnection | null;
  sessionUrl: string | null;
  refCount: number;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  listeners: Set<(stream: MediaStream | null, status: 'idle' | 'connecting' | 'connected' | 'error') => void>;
  closeTimeout: ReturnType<typeof setTimeout> | null;
}

// Global registry of active WebRTC streams (deduplicated by sourceName)
const activeStreams = new Map<string, StreamEntry>();

async function startWebRTCStream(entry: StreamEntry) {
  if (entry.status === 'connecting' || entry.status === 'connected') return;
  entry.status = 'connecting';
  notifyListeners(entry);

  try {
    // Same-origin WHEP proxy: this app's server adds the streaming server's
    // token, so the browser never sees the upstream address or credentials.
    const whepUrl = `/api/camera-feed/${encodeURIComponent(entry.sourceName)}/whep`;

    // 1. Create RTCPeerConnection. No ICE servers: the streaming server is on
    // the LAN (host candidates), and an offline site has no public STUN.
    const pc = new RTCPeerConnection({
      iceServers: [],
      // @ts-ignore - unified-plan
      sdpSemantics: 'unified-plan',
    });
    entry.pc = pc;

    // Receive only video
    pc.addTransceiver('video', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        entry.stream = event.streams[0];
        entry.status = 'connected';
        notifyListeners(entry);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        entry.status = 'connected';
        notifyListeners(entry);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        entry.status = 'error';
        notifyListeners(entry);
      }
    };

    // 2. Create Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 3. Send SDP Offer to the WHEP proxy
    const whepRes = await fetch(whepUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    });

    if (whepRes.status !== 201) {
      throw new Error(`MediaMTX WHEP error status ${whepRes.status}`);
    }

    const location = whepRes.headers.get('location');
    if (location) {
      entry.sessionUrl = new URL(location, window.location.origin).toString();
    }

    const answerSdp = await whepRes.text();
    await pc.setRemoteDescription(
      new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp,
      })
    );
  } catch (err) {
    console.warn(`[WebRTC Stream Hub] Error starting ${entry.sourceName}:`, err);
    entry.status = 'error';
    notifyListeners(entry);
  }
}

function stopWebRTCStream(entry: StreamEntry) {
  if (entry.pc) {
    try {
      entry.pc.close();
    } catch {}
    entry.pc = null;
  }
  if (entry.sessionUrl) {
    fetch(entry.sessionUrl, { method: 'DELETE' }).catch(() => {});
    entry.sessionUrl = null;
  }
  entry.stream = null;
  entry.status = 'idle';
  notifyListeners(entry);
}

function notifyListeners(entry: StreamEntry) {
  entry.listeners.forEach((listener) => listener(entry.stream, entry.status));
}

/**
 * React hook to get a shared, hardware-accelerated MediaStream for any camera.
 * If 10 components on the screen display the same camera (e.g. "CEO"),
 * ONLY ONE WebRTC connection is opened to the server, and all 10 components share the exact same stream!
 */
export function useSharedCameraStream(
  sourceName?: string | null,
  active: boolean = true
): { stream: MediaStream | null; status: 'idle' | 'connecting' | 'connected' | 'error' } {
  const [stream, setStream] = useState<MediaStream | null>(() => {
    if (!sourceName) return null;
    return activeStreams.get(sourceName)?.stream || null;
  });
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>(() => {
    if (!sourceName || !active) return 'idle';
    return activeStreams.get(sourceName)?.status || 'idle';
  });

  useEffect(() => {
    if (!sourceName || !active) {
      setStream(null);
      setStatus('idle');
      return;
    }

    let entry = activeStreams.get(sourceName);
    if (!entry) {
      entry = {
        sourceName,
        stream: null,
        pc: null,
        sessionUrl: null,
        refCount: 0,
        status: 'idle',
        listeners: new Set(),
        closeTimeout: null,
      };
      activeStreams.set(sourceName, entry);
    }

    if (entry.closeTimeout) {
      clearTimeout(entry.closeTimeout);
      entry.closeTimeout = null;
    }

    entry.refCount++;

    const listener = (newStream: MediaStream | null, newStatus: 'idle' | 'connecting' | 'connected' | 'error') => {
      setStream(newStream);
      setStatus(newStatus);
    };

    entry.listeners.add(listener);
    setStream(entry.stream);
    setStatus(entry.status);

    if (!entry.stream && entry.status !== 'connecting') {
      startWebRTCStream(entry);
    }

    return () => {
      if (!entry) return;
      entry.listeners.delete(listener);
      entry.refCount--;

      if (entry.refCount <= 0) {
        // 5-second grace period before closing the WebRTC connection
        entry.closeTimeout = setTimeout(() => {
          if (entry && entry.refCount <= 0) {
            stopWebRTCStream(entry);
            activeStreams.delete(sourceName);
          }
        }, 5000);
      }
    };
  }, [sourceName, active]);

  return { stream, status };
}
