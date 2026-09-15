import { AdminState, GenerateMode, GenerateResult, Me, PassportData, PublicUser } from './types';

let csrfToken: string | null = null;

export function setCsrf(token: string | null) {
  csrfToken = token;
}

function jsonHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrfToken) h['X-CSRF-Token'] = csrfToken;
  return h;
}

function csrfHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (csrfToken) h['X-CSRF-Token'] = csrfToken;
  return h;
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = (data && typeof data === 'object' && (data as any).error) || `Request failed (${res.status})`;
    const err: any = new Error(error);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function getMe(): Promise<Me> {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  const data = await parse<Me>(res);
  setCsrf(data.csrf);
  return data;
}

export function startSteamLogin() {
  window.location.href = '/api/auth/steam';
}

export async function logout(): Promise<void> {
  setCsrf(null);
  window.location.href = '/api/auth/logout';
}

export async function adminLogin(username: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/admin/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password }),
    credentials: 'same-origin',
  });
  await parse<{ ok: boolean }>(res);
}

export async function adminLogout(): Promise<void> {
  const res = await fetch('/api/auth/admin/logout', {
    method: 'POST',
    headers: jsonHeaders(),
    credentials: 'same-origin',
  });
  await parse<{ ok: boolean }>(res);
  setCsrf(null);
}

export async function fetchPassport(steamid: string): Promise<PassportData> {
  const res = await fetch(`/api/u/${steamid}/card`, { credentials: 'same-origin' });
  return parse<PassportData>(res);
}

export async function fetchPublicUsers(): Promise<PublicUser[]> {
  const res = await fetch('/api/u', { credentials: 'same-origin' });
  const data = await parse<{ users: PublicUser[] }>(res);
  return data.users;
}

export async function generate(mode: GenerateMode, opts: { zip?: File; files?: File[] } = {}): Promise<GenerateResult> {
  const fd = new FormData();
  fd.set('mode', mode);
  if (opts.zip) fd.append('crZip', opts.zip);
  if (opts.files) {
    for (const f of opts.files) fd.append('crFiles', f, f.webkitRelativePath || f.name);
  }
  const res = await fetch('/api/generate', {
    method: 'POST',
    body: fd,
    headers: csrfHeaders(),
    credentials: 'same-origin',
  });
  return parse<GenerateResult>(res);
}

export async function adminState(): Promise<AdminState> {
  const res = await fetch('/api/admin/state', { credentials: 'same-origin' });
  return parse<AdminState>(res);
}

export async function adminPost(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`/api/admin${path}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  return parse<any>(res);
}

export async function adminDelete(path: string): Promise<any> {
  const res = await fetch(`/api/admin${path}`, {
    method: 'DELETE',
    headers: csrfHeaders(),
    credentials: 'same-origin',
  });
  return parse<any>(res);
}

export function badgeUrl(steamid: string): string {
  return `${window.location.origin}/badge.svg?steamid=${steamid}`;
}

export function cardUrl(steamid: string): string {
  return `${window.location.origin}/u/${steamid}`;
}