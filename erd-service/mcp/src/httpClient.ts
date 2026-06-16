// 배포된 ERD 서비스 HTTP 클라이언트.
// 두 가지 동작 모드:
//  ① 원격(co-host) HTTP 모드 — reqCtx에 단기 JWT가 있으면, 그 사용자로서 자기 백엔드
//     (/api/*)를 Authorization: Bearer로 호출한다. 서비스계정/쿠키 보관 없음.
//  ② stdio 모드 — reqCtx가 비어 있으면 기존처럼 서비스계정으로 로그인해 JWT 쿠키를
//     메모리에 보관하고, 401이면 1회 재로그인 후 재시도한다.
// 어느 모드든 백엔드 /api/auth/login + /api/diagrams 계약은 그대로 사용.

import { getConfig } from './config';
import { reqCtx } from './requestContext';

let cookie: string | null = null;

// stdout은 MCP 프로토콜 채널이므로 로그는 전부 stderr로
function logErr(msg: string) {
  process.stderr.write(`[erd-mcp] ${msg}\n`);
}

function extractTokenCookie(res: Response): string | null {
  // undici(Node 전역 fetch)의 getSetCookie 우선, 없으면 단일 set-cookie 헤더 파싱
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
  for (const raw of list) {
    const pair = raw.split(';')[0]?.trim();
    if (pair && pair.startsWith('token=')) return pair;
  }
  return null;
}

async function doLogin(): Promise<void> {
  const { baseUrl, username, password } = getConfig();
  if (!username || !password) {
    throw new Error('ERD_USERNAME / ERD_PASSWORD 환경변수가 필요합니다.');
  }
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(`로그인 실패 (HTTP ${res.status})${body?.error ? `: ${body.error}` : ''}`);
  }
  const token = extractTokenCookie(res);
  if (!token) throw new Error('로그인 응답에 token 쿠키가 없습니다.');
  cookie = token;
  logErr(`로그인 성공: ${username} @ ${baseUrl}`);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = reqCtx.getStore();

  // ① 원격 HTTP 모드 — 요청 사용자의 단기 JWT를 베어러로 첨부해 자기 백엔드 호출
  if (ctx?.jwt) {
    const base = (ctx.baseUrl ?? getConfig().baseUrl).replace(/\/+$/, '');
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${ctx.jwt}`,
      },
    });
  }

  // ② stdio 모드 — 서비스계정 쿠키 로그인 + 401 재시도
  const { baseUrl } = getConfig();
  if (!cookie) await doLogin();

  const send = () => fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Cookie: cookie as string,
    },
  });

  let res = await send();
  if (res.status === 401) {
    cookie = null;
    await doLogin();
    res = await send();
  }
  return res;
}

// JSON 응답 파싱 + 에러 표준화
export async function apiJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json().catch(() => null) as (T & { error?: string; message?: string }) | null;
  if (!res.ok) {
    const detail = body?.error ?? body?.message ?? '';
    throw new Error(`API ${init.method ?? 'GET'} ${path} 실패 (HTTP ${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return body as T;
}
