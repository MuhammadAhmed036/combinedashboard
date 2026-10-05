import crypto from "crypto";

interface SnapshotResult {
  buffer: Buffer;
  contentType: string;
}

const snapshotCache = new Map<string, { expiresAt: number; data: SnapshotResult }>();
let streamsCache: { expiresAt: number; rows: Array<{ name: string; input_url: string }> } | null = null;

export function parseRtspUrl(inputUrl: string): { user: string; pass: string; host: string } | null {
  if (!inputUrl || !inputUrl.startsWith("rtsp://")) return null;
  const afterScheme = inputUrl.slice(7);
  const lastAt = afterScheme.lastIndexOf("@");
  if (lastAt === -1) return null;
  const creds = afterScheme.slice(0, lastAt);
  const hostPart = afterScheme.slice(lastAt + 1).split("/")[0].split(":")[0];
  const firstColon = creds.indexOf(":");
  if (firstColon === -1) return null;
  const user = creds.slice(0, firstColon);
  const pass = creds.slice(firstColon + 1);
  return { user, pass, host: hostPart };
}

async function fetchDigest(url: string, user: string, pass: string): Promise<Response> {
  const res1 = await fetch(url, { signal: AbortSignal.timeout(3500) });
  if (res1.status === 200) return res1;

  const auth = res1.headers.get("www-authenticate") || "";
  const getParam = (k: string) => {
    const m = auth.match(new RegExp(k + '="?([^",]+)'));
    return m ? m[1] : "";
  };

  const realm = getParam("realm");
  const nonce = getParam("nonce");
  const qop = getParam("qop");
  const opaque = getParam("opaque");

  if (!realm || !nonce) return res1;

  const uri = new URL(url).pathname;
  const ha1 = crypto.createHash("md5").update(`${user}:${realm}:${pass}`).digest("hex");
  const ha2 = crypto.createHash("md5").update(`GET:${uri}`).digest("hex");
  const nc = "00000001";
  const cnonce = "12345678";

  const resp = qop
    ? crypto.createHash("md5").update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest("hex")
    : crypto.createHash("md5").update(`${ha1}:${nonce}:${ha2}`).digest("hex");

  const header = qop
    ? `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${resp}", opaque="${opaque}"`
    : `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${resp}"`;

  return fetch(url, { headers: { Authorization: header }, signal: AbortSignal.timeout(3500) });
}

export async function getCameraSnapshot(cameraName: string): Promise<SnapshotResult | null> {
  const key = cameraName.toLowerCase();
  const now = Date.now();
  const cached = snapshotCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    if (!streamsCache || streamsCache.expiresAt < now) {
      const streamsUrl = process.env.STREAMS_API_URL;
      if (!streamsUrl) return null;
      const user = process.env.STREAMS_API_USERNAME || "";
      const pass = process.env.STREAMS_API_PASSWORD || "";
      const headers: Record<string, string> = { Accept: "application/json" };
      if (user || pass) {
        headers.Authorization = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
      }

      const res = await fetch(streamsUrl, {
        headers,
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        streamsCache = {
          expiresAt: now + 10_000,
          rows: Array.isArray(data.rows) ? data.rows : [],
        };
      }
    }

    const cam = streamsCache?.rows.find(
      (r) => r.name && r.name.toLowerCase() === key
    );

    if (!cam || !cam.input_url) {
      return null;
    }

    const parsed = parseRtspUrl(cam.input_url);
    if (!parsed) return null;

    const { user, pass, host } = parsed;
    const candidatePaths = [
      "/images/snapshot.jpg",
      "/ISAPI/Streaming/channels/101/picture",
      "/onvif-http/snapshot",
      "/cgi-bin/snapshot.cgi",
    ];

    for (const p of candidatePaths) {
      try {
        const url = `http://${host}${p}`;
        const res = await fetchDigest(url, user, pass);
        if (res.status === 200) {
          const buf = Buffer.from(await res.arrayBuffer());
          const result: SnapshotResult = {
            buffer: buf,
            contentType: res.headers.get("content-type") || "image/jpeg",
          };
          snapshotCache.set(key, { expiresAt: now + 3000, data: result });
          return result;
        }
      } catch {
        // try next candidate endpoint
      }
    }
  } catch (err) {
    console.warn(`[cameraSnapshot] Warning fetching snapshot for ${cameraName}:`, err);
  }

  return null;
}
