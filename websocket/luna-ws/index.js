/**
 * Node.js WebSocket Proxy for Luna Events
 * ========================================
 * Replaces the Python FastAPI socket with a lightweight, robust Node.js WebSocket proxy.
 * Relays real-time face detection & match events between browser clients and the upstream Luna platform.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocket, WebSocketServer } = require('ws');
const { URL } = require('url');

// Try loading root .env if running on host
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const PORT = parseInt(process.env.LUNA_WS_PORT || process.env.WS_PORT || '8092', 10);
const LUNA_HOST = process.env.LUNA_HOST || '192.168.18.71';
const LUNA_API_PORT = process.env.LUNA_API_PORT || '5000';
const LUNA_ACCOUNT_ID = process.env.LUNA_ACCOUNT_ID || '00000000-0000-4000-b000-000000000146';
const LUNA_AUTH_USER = process.env.LUNA_AUTH_USER || 'root@visionlabs.ai';
const LUNA_AUTH_PASS = process.env.LUNA_AUTH_PASS || 'root';

function getLunaAuthHeaders() {
  const credentials = Buffer.from(`${LUNA_AUTH_USER}:${LUNA_AUTH_PASS}`).toString('base64');
  return {
    Authorization: `Basic ${credentials}`,
    'Luna-Account-Id': LUNA_ACCOUNT_ID,
  };
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'luna-ws', port: PORT }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (clientWs, req) => {
  const clientUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const searchParams = clientUrl.searchParams.toString();

  const upstreamWsUrl = `ws://${LUNA_HOST}:${LUNA_API_PORT}/6/ws${
    searchParams ? `?${searchParams}` : ''
  }`;

  console.log(`[luna-ws] Client connected. Forwarding to Luna upstream: ${upstreamWsUrl}`);

  let upstreamWs = null;
  let isClientClosed = false;

  try {
    upstreamWs = new WebSocket(upstreamWsUrl, {
      headers: getLunaAuthHeaders(),
    });
  } catch (err) {
    console.error(`[luna-ws] Error creating upstream connection:`, err.message);
    clientWs.close(1011, 'Failed to connect to Luna service');
    return;
  }

  // Upstream open
  upstreamWs.on('open', () => {
    console.log(`[luna-ws] Connected to upstream Luna successfully`);
  });

  // Relay upstream -> client
  upstreamWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  upstreamWs.on('error', (err) => {
    console.warn(`[luna-ws] Luna upstream error: ${err.message}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, `Luna upstream error: ${err.message}`);
    }
  });

  upstreamWs.on('close', (code, reason) => {
    console.log(`[luna-ws] Luna upstream closed: code=${code}`);
    if (!isClientClosed && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason);
    }
  });

  // Relay client -> upstream (e.g. filters or ping)
  clientWs.on('message', (data, isBinary) => {
    if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('close', () => {
    isClientClosed = true;
    console.log(`[luna-ws] Client disconnected`);
    if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.close();
    }
  });

  clientWs.on('error', (err) => {
    console.warn(`[luna-ws] Client socket error: ${err.message}`);
    if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.close();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[luna-ws] Luna WebSocket proxy listening on http://0.0.0.0:${PORT}`);
  console.log(`[luna-ws] Configured Luna target: ${LUNA_HOST}:${LUNA_API_PORT} (Account: ${LUNA_ACCOUNT_ID})`);
});
