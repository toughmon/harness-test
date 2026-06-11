// 다이어그램 단위 도구 — 목록/조회/생성/선택/이름변경/삭제.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defineTool, ok, summarizeDoc, REFRESH_NOTE } from '../helpers';
import {
  listDiagrams,
  createDiagram,
  loadDoc,
  renameDiagram,
  deleteDiagram,
  emptyERDData,
} from '../erdClient';
import { getCurrentId, setCurrentId, requireCurrentId } from '../session';

export function registerDiagramTools(server: McpServer): void {
  defineTool(server, 'list_diagrams', {
    title: '다이어그램 목록',
    description: '서비스 계정이 소유한 ERD 다이어그램 목록을 반환합니다.',
    inputSchema: {},
  }, async () => {
    const list = await listDiagrams();
    return ok({ diagrams: list, currentId: getCurrentId() });
  });

  defineTool(server, 'create_diagram', {
    title: '다이어그램 생성',
    description: '빈 ERD 다이어그램을 새로 만들고 현재 작업 대상으로 선택합니다.',
    inputSchema: { name: z.string().min(1).describe('다이어그램 이름') },
  }, async ({ name }) => {
    const meta = await createDiagram(name, emptyERDData());
    setCurrentId(meta.id);
    return ok({ created: meta, currentId: meta.id });
  });

  defineTool(server, 'select_diagram', {
    title: '다이어그램 선택',
    description: '작업 대상 다이어그램을 선택합니다. diagram_id 또는 name 중 하나를 지정하세요.',
    inputSchema: {
      diagram_id: z.number().int().optional(),
      name: z.string().optional(),
    },
  }, async ({ diagram_id, name }) => {
    let id = diagram_id ?? null;
    if (id == null && name) {
      const list = await listDiagrams();
      const matches = list.filter(d => d.name === name);
      if (matches.length === 0) throw new Error(`'${name}' 이름의 다이어그램이 없습니다.`);
      if (matches.length > 1) throw new Error(`'${name}' 이름의 다이어그램이 여러 개입니다. diagram_id로 지정하세요.`);
      id = matches[0].id;
    }
    if (id == null) throw new Error('diagram_id 또는 name을 지정하세요.');
    const { meta, doc } = await loadDoc(id);
    setCurrentId(id);
    return ok({ selected: meta, summary: summarizeDoc(doc) });
  });

  defineTool(server, 'get_diagram', {
    title: '다이어그램 조회',
    description: '현재(또는 지정한) 다이어그램의 엔티티·컬럼·관계 요약을 반환합니다.',
    inputSchema: {
      diagram_id: z.number().int().optional(),
      raw: z.boolean().optional().describe('true면 전체 원본 데이터 포함'),
    },
  }, async ({ diagram_id, raw }) => {
    const id = diagram_id ?? requireCurrentId();
    const { meta, doc } = await loadDoc(id);
    const payload: Record<string, unknown> = { diagram: meta, summary: summarizeDoc(doc) };
    if (raw) payload.raw = doc;
    return ok(payload);
  });

  defineTool(server, 'rename_diagram', {
    title: '다이어그램 이름 변경',
    description: '다이어그램 이름을 변경합니다.',
    inputSchema: {
      diagram_id: z.number().int().optional(),
      name: z.string().min(1),
    },
  }, async ({ diagram_id, name }) => {
    const id = diagram_id ?? requireCurrentId();
    const meta = await renameDiagram(id, name);
    return ok({ renamed: meta });
  });

  defineTool(server, 'delete_diagram', {
    title: '다이어그램 삭제',
    description: '다이어그램을 영구 삭제합니다. 안전을 위해 diagram_id를 반드시 명시해야 합니다.',
    inputSchema: { diagram_id: z.number().int().describe('삭제할 다이어그램 id (필수)') },
  }, async ({ diagram_id }) => {
    await deleteDiagram(diagram_id);
    if (getCurrentId() === diagram_id) setCurrentId(null);
    return ok({ deleted: diagram_id }, REFRESH_NOTE);
  });
}
