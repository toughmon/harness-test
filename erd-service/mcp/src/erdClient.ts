// 다이어그램 CRUD 래퍼 + ErdDoc(메모리 모델) ↔ ERDData(저장 blob) 변환.
// 백엔드는 blob 단위 CRUD만 제공하므로, 변형은 'GET blob → erdOps로 변형 → PUT blob'.

import { apiJson } from './httpClient';
import { toERDData, fromERDData, type ErdDoc, type ERDData } from './shared';

export interface DiagramMeta {
  id: number;
  name: string;
  updated_at: string;
}
export interface DiagramRaw extends DiagramMeta {
  data: ERDData;
}

export function listDiagrams(): Promise<DiagramMeta[]> {
  return apiJson<DiagramMeta[]>('/api/diagrams');
}

export function createDiagram(name: string, data: ERDData): Promise<DiagramMeta> {
  return apiJson<DiagramMeta>('/api/diagrams', {
    method: 'POST',
    body: JSON.stringify({ name, data }),
  });
}

export function getDiagramRaw(id: number): Promise<DiagramRaw> {
  return apiJson<DiagramRaw>(`/api/diagrams/${id}`);
}

export function renameDiagram(id: number, name: string): Promise<DiagramMeta> {
  return apiJson<DiagramMeta>(`/api/diagrams/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deleteDiagram(id: number): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/api/diagrams/${id}`, { method: 'DELETE' });
}

// ── 문서 단위 로드/저장 ──

export async function loadDoc(id: number): Promise<{ meta: { id: number; name: string }; doc: ErdDoc }> {
  const dg = await getDiagramRaw(id);
  const { entities, relationships, positions } = fromERDData(dg.data);
  return {
    meta: { id: dg.id, name: dg.name },
    doc: { entities, relationships, nodePositions: positions },
  };
}

export async function saveDoc(id: number, doc: ErdDoc): Promise<DiagramMeta> {
  const data = toERDData(doc.entities, doc.relationships, doc.nodePositions);
  return apiJson<DiagramMeta>(`/api/diagrams/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ data }),
  });
}

export function emptyERDData(): ERDData {
  return toERDData([], [], {});
}
