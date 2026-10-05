'use client';

import { useState, useEffect } from 'react';
import { loadRuntimeConfig } from './runtimeConfig';

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

function getAuthHeader(user?: string, pass?: string): Record<string, string> {
  if (!user && !pass) return {};
  const creds = btoa(`${user || ''}:${pass || ''}`);
  return { Authorization: `Basic ${creds}` };
}

async function startWebRTCStream(entry: StreamEntry) {
  if (entry.status === 'connecting' || entry.status === 'connected') return;
  entry.status = 'connecting';
  notifyListeners(entry);

  try {
    const config = await loadRuntimeConfig();
    const baseUrl = config.cameraFeedBaseUrl;
    if (!baseUrl) {
      console.warn('[WebRTC] Camera feed base URL is not configured in environment');
      entry.status = 'error';
      notifyListeners(entry);
      return;
    }
    const whepUrl = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(entry.sourceName)}/whep`;
    const authHeaders = getAuthHeader(config.cameraFeedUser, config.cameraFeedPass);

    // 1. Get ICE servers from MediaMTX OPTIONS if available
    let iceServers: RTCIceServer[] = [];
    try {
      const optionsRes = await fetch(whepUrl, {
        method: 'OPTIONS',
        headers: { ...authHeaders },
      });
      const link = optionsRes.headers.get('Link');
      if (link) {
        const matches = link.matchAll(/<([^>]+)>;\s*rel="([^"]+)"/g);
        for (const match of matches) {
          if (match[2] === 'ice-server') {
            iceServers.push({ urls: match[1] });
          }
        }
      }
    } catch {
      // OPTIONS optional fallback
    }

    if (iceServers.length === 0) {
      iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    }

    // 2. Create RTCPeerConnection
    const pc = new RTCPeerConnection({
      iceServers,
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

    // 3. Create Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 4. Send SDP Offer to MediaMTX WHEP
    const whepRes = await fetch(whepUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    });

    if (whepRes.status !== 201) {
      throw new Error(`MediaMTX WHEP error status ${whepRes.status}`);
    }

    const location = whepRes.headers.get('location');
    if (location) {
      entry.sessionUrl = new URL(location, whepUrl).toString();
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
