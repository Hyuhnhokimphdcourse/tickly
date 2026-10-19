/**
 * Google Drive storage for the web build, with no backend:
 *  - Google Identity Services token model gives a short-lived access token from a tap
 *    (https://developers.google.com/identity/oauth2/web/guides/use-token-model)
 *  - Drive REST v3 stores one JSON file in a "Tickly" folder of the user's own Drive.
 */
import type { AppData } from '../types';
import { DRIVE_FILE, DRIVE_FOLDER, DRIVE_SCOPE, GOOGLE_CLIENT_ID } from './config';

export const driveSupported = true;
export class AuthError extends Error {}

interface TokenResponse { access_token?: string; expires_in?: number; error?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string }): void }
interface GoogleOAuth2 {
  initTokenClient(c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string }) => void }): TokenClient;
  revoke(token: string, done?: () => void): void;
}
declare global { interface Window { google?: { accounts?: { oauth2?: GoogleOAuth2 } } } }

const TOKEN_KEY = 'tickly.gtoken';
let client: TokenClient | null = null;
let token: { value: string; exp: number } | null = (() => {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
    return t && t.exp > Date.now() ? t : null;
  } catch { return null; }
})();

function saveToken() {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

/** Load the Google script and prepare the token client (call early, so a later tap can open the popup). */
export function loadDrive(onToken: (ok: boolean, err?: string) => void) {
  const init = () => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2 || client) return;
    client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: r => {
        if (r.error || !r.access_token) { onToken(false, r.error ?? 'no_token'); return; }
        token = { value: r.access_token, exp: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 };
        saveToken();
        onToken(true);
      },
      error_callback: e => onToken(false, e.type ?? 'popup_error'),
    });
  };
  if (window.google?.accounts?.oauth2) { init(); return; }
  if (document.getElementById('gis-client')) return;
  const s = document.createElement('script');
  s.id = 'gis-client';
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = init;
  document.head.appendChild(s);
}

export const driveReady = () => client != null;
export const hasToken = () => !!token && token.exp > Date.now();

/** Must run inside a tap (opens Google's popup). */
export function requestToken(firstTime: boolean) {
  client?.requestAccessToken({ prompt: firstTime ? 'consent' : '' });
}

export function revokeToken() {
  if (token) window.google?.accounts?.oauth2?.revoke(token.value);
  token = null;
  saveToken();
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  if (!hasToken()) throw new AuthError('token');
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token!.value}` } });
  if (res.status === 401) { token = null; saveToken(); throw new AuthError('expired'); }
  if (!res.ok) {
    let msg = `Drive ${res.status}`;
    try { const j = await res.json(); if (j?.error?.message) msg += `: ${j.error.message}`; } catch { /* ignore */ }
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res;
}

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const q = (s: string) => encodeURIComponent(s);

async function findOne(query: string): Promise<string | null> {
  const r = await api(`${DRIVE}/files?q=${q(query)}&spaces=drive&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`);
  const j = (await r.json()) as { files?: { id: string }[] };
  return j.files?.[0]?.id ?? null;
}

async function createMultipart(meta: object, content: string, contentType: string): Promise<string> {
  const b = `tickly${Date.now()}`;
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${b}--`;
  const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
  return ((await r.json()) as { id: string }).id;
}

/** The "Tickly" folder and its data file in the user's Drive (created on first use). */
export async function findOrCreateDataFile(): Promise<string> {
  let folder = await findOne(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  if (!folder) {
    const r = await api(`${DRIVE}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }) });
    folder = ((await r.json()) as { id: string }).id;
  }
  const file = await findOne(`name='${DRIVE_FILE}' and '${folder}' in parents and trashed=false`);
  if (file) return file;
  return createMultipart({ name: DRIVE_FILE, parents: [folder], mimeType: 'application/json' }, '{}', 'application/json');
}

export async function downloadJson(id: string): Promise<AppData | null> {
  const r = await api(`${DRIVE}/files/${id}?alt=media`);
  const text = await r.text();
  try {
    const j = JSON.parse(text) as AppData;
    return Array.isArray(j?.watches) ? j : null;
  } catch {
    return null;
  }
}

export async function uploadJson(id: string, data: AppData): Promise<void> {
  await api(`${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}

export async function whoAmI(): Promise<string | null> {
  try {
    const r = await api(`${DRIVE}/about?fields=user(emailAddress)`);
    return ((await r.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? null;
  } catch { return null; }
}
