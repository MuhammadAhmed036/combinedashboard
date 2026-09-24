import "server-only";

import { createHash, randomBytes } from "node:crypto";

interface Credentials {
  username?: string;
  password?: string;
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function parseDigestChallenge(header: string): Record<string, string> {
  const challenge = header.replace(/^Digest\s+/i, "");
  const values: Record<string, string> = {};
  const pattern = /(\w+)=("([^"]*)"|([^,\s]+))/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(challenge))) {
    values[match[1].toLowerCase()] = match[3] ?? match[4];
  }

  return values;
}

function digestAuthorization(
  url: URL,
  method: string,
  challengeHeader: string,
  username: string,
  password: string
): string | null {
  const challenge = parseDigestChallenge(challengeHeader);
  const realm = challenge.realm;
  const nonce = challenge.nonce;
  if (!realm || !nonce) return null;

  const algorithm = (challenge.algorithm || "MD5").toUpperCase();
  if (algorithm !== "MD5" && algorithm !== "MD5-SESS") return null;

  const uri = `${url.pathname}${url.search}`;
  const qopOptions = (challenge.qop || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const qop = qopOptions.includes("auth") ? "auth" : undefined;
  const nc = "00000001";
  const cnonce = randomBytes(8).toString("hex");

  let ha1 = md5(`${username}:${realm}:${password}`);
  if (algorithm === "MD5-SESS") ha1 = md5(`${ha1}:${nonce}:${cnonce}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${username.replaceAll('"', '\\"')}"`,
    `realm="${realm.replaceAll('"', '\\"')}"`,
    `nonce="${nonce.replaceAll('"', '\\"')}"`,
    `uri="${uri.replaceAll('"', '\\"')}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`,
  ];

  if (challenge.opaque) parts.push(`opaque="${challenge.opaque.replaceAll('"', '\\"')}"`);
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  return `Digest ${parts.join(", ")}`;
}

export async function authenticatedFetch(
  input: string | URL,
  init: RequestInit,
  credentials: Credentials
): Promise<Response> {
  const url = new URL(input);
  const username = credentials.username;
  const password = credentials.password ?? "";
  const headers = new Headers(init.headers);

  if (username) {
    headers.set(
      "Authorization",
      `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
    );
  }

  let response = await fetch(url, { ...init, headers, cache: "no-store" });
  const challenge = response.headers.get("www-authenticate");

  if (
    response.status === 401 &&
    username &&
    challenge?.toLowerCase().startsWith("digest ")
  ) {
    await response.body?.cancel();
    const authorization = digestAuthorization(
      url,
      init.method ?? "GET",
      challenge,
      username,
      password
    );

    if (authorization) {
      headers.set("Authorization", authorization);
      response = await fetch(url, { ...init, headers, cache: "no-store" });
    }
  }

  return response;
}
