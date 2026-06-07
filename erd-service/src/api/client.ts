import { ERDData } from '../types/erd';

// 백엔드 API 클라이언트 — 동일 오리진(/api), JWT는 httpOnly 쿠키로 자동 전송

export interface User {
  id: number;
  username: string;
}

export interface DiagramMeta {
  id: number;
  name: string;
  updated_at: string;
}

export interface Diagram extends DiagramMeta {
  data: ERDData;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? body?.message ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export const api = {
  // auth
  register: (username: string, password: string) =>
    request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<User>('/api/auth/me'),

  // diagrams
  listDiagrams: () => request<DiagramMeta[]>('/api/diagrams'),
  getDiagram: (id: number) => request<Diagram>(`/api/diagrams/${id}`),
  createDiagram: (name: string, data: ERDData) =>
    request<DiagramMeta>('/api/diagrams', { method: 'POST', body: JSON.stringify({ name, data }) }),
  updateDiagram: (id: number, data: ERDData, name?: string) =>
    request<DiagramMeta>(`/api/diagrams/${id}`, { method: 'PUT', body: JSON.stringify({ name, data }) }),
  renameDiagram: (id: number, name: string) =>
    request<DiagramMeta>(`/api/diagrams/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteDiagram: (id: number) =>
    request<{ ok: boolean }>(`/api/diagrams/${id}`, { method: 'DELETE' }),
};
