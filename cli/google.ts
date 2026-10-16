// Sign in with Google, for one thing: writing "done" back into the sheet a request was
// gathered from. The user brings their own OAuth client (Desktop app type, Sheets API
// on): a client secret shipped in an open-source app would be shared by every install.
// Tokens stay in ~/.kaizen/google.json, owner-only, and go to Google hosts only.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { home } from "./state.ts";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const FILE = () => join(home, ".kaizen", "google.json");

type Creds = { client_id?: string; client_secret?: string; refresh_token?: string; access_token?: string; expires_at?: number };

const load = (): Creds => { try { return JSON.parse(readFileSync(FILE(), "utf8")); } catch { return {}; } };

function save(c: Creds) {
  mkdirSync(join(home, ".kaizen"), { recursive: true });
  const tmp = FILE() + ".tmp";
  writeFileSync(tmp, JSON.stringify(c, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, FILE());
}

export function status() {
  const c = existsSync(FILE()) ? load() : {};
  return { connected: !!c.refresh_token, hasClient: !!(c.client_id && c.client_secret) };
}

export function setClient(id: string, secret: string) {
  save({ client_id: id.trim(), client_secret: secret.trim() });   // a new client voids the old sign-in
}

export function signOut() { const { client_id, client_secret } = load(); save({ client_id, client_secret }); }

const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");
const rand = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

let pending: { state: string; verifier: string; redirect: string } | null = null;

export async function authorizeUrl(port: number): Promise<string> {
  const c = load();
  if (!c.client_id || !c.client_secret) throw new Error("Add the Google client id and secret first.");
  const verifier = rand(), state = rand();
  const redirect = `http://127.0.0.1:${port}/google-callback`;
  pending = { state, verifier, redirect };
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return `${AUTH}?${new URLSearchParams({ client_id: c.client_id, redirect_uri: redirect, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", state, code_challenge_method: "S256", code_challenge: challenge })}`;
}

async function token(form: Record<string, string>) {
  const r = await fetch(TOKEN, { method: "POST", body: new URLSearchParams(form), signal: AbortSignal.timeout(30_000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `sign-in failed (HTTP ${r.status})`);
  return j;
}

// Null when signed in; otherwise why not.
export async function callback(q: URLSearchParams): Promise<string | null> {
  const p = pending, c = load();
  if (!p || q.get("state") !== p.state) return "This sign-in is stale. Start it again from the Icebox.";
  pending = null;
  if (q.get("error")) return q.get("error");
  if (!q.get("code") || !c.client_id || !c.client_secret) return "Google sent no sign-in code back.";
  try {
    const t = await token({ grant_type: "authorization_code", client_id: c.client_id, client_secret: c.client_secret, code: q.get("code")!, code_verifier: p.verifier, redirect_uri: p.redirect });
    if (!t.refresh_token) return "Google gave no refresh token. Remove kaizen from your Google account's third-party access and connect again.";
    if (!String(t.scope ?? "").split(" ").includes(SCOPE)) return "Google did not grant access to your sheets.";
    save({ ...c, refresh_token: t.refresh_token, access_token: t.access_token, expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 });
    return null;
  } catch (e) { return (e as Error).message; }
}

async function access(): Promise<string> {
  const c = load();
  if (!c.refresh_token || !c.client_id || !c.client_secret) throw new Error("Google is not connected.");
  if (c.access_token && (c.expires_at ?? 0) > Date.now() + 60_000) return c.access_token;
  try {
    const t = await token({ grant_type: "refresh_token", client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token });
    save({ ...c, access_token: t.access_token, expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 });
    return t.access_token;
  } catch (e) {
    if (/invalid_grant/.test((e as Error).message)) { signOut(); throw new Error("Google signed kaizen out. Connect again from the Icebox."); }
    throw e;
  }
}

// A Sheets API call. Only the Sheets host is ever sent the token.
export async function sheets(path: string, init: { method?: string; body?: unknown } = {}, doFetch: typeof fetch = fetch, token: () => Promise<string> = access): Promise<any> {
  const r = await doFetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${await token()}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Google Sheets answered HTTP ${r.status}`);
  return j;
}
