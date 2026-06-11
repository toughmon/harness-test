// 도구 등록 래퍼 + 응답 포맷 + 현재 다이어그램 변형 헬퍼.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ErdDoc } from './shared';
import { loadDoc, saveDoc } from './erdClient';
import { requireCurrentId } from './session';

// MCP 편집은 DB blob에 기록되며, 이미 열린 브라우저에는 자동 반영되지 않는다.
export const REFRESH_NOTE =
  '※ 브라우저에 이미 열려 있다면 다이어그램을 다시 열거나 새로고침해야 변경이 보입니다.';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

export function ok(payload: unknown, note?: string): ToolResult {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text: note ? `${text}\n\n${note}` : text }] };
}

// 도구 핸들러를 try/catch로 감싸 에러를 MCP isError 응답으로 변환
export function defineTool(
  server: McpServer,
  name: string,
  config: { title?: string; description?: string; inputSchema?: Record<string, unknown> },
  handler: (args: any) => Promise<ToolResult>
): void {
  server.registerTool(name, config as any, async (args: any) => {
    try {
      return await handler(args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `오류: ${msg}` }], isError: true };
    }
  });
}

// 현재 다이어그램을 로드 → mutator로 변형 → 저장. mutator는 {doc, result}를 반환.
export async function withCurrentDoc<R>(
  mutator: (doc: ErdDoc) => { doc: ErdDoc; result: R }
): Promise<R> {
  const id = requireCurrentId();
  const { doc } = await loadDoc(id);
  const { doc: nextDoc, result } = mutator(doc);
  await saveDoc(id, nextDoc);
  return result;
}

// 토큰 절약을 위한 다이어그램 요약 뷰 (LLM이 필요로 하는 id 포함)
export function summarizeDoc(doc: ErdDoc) {
  return {
    entities: doc.entities.map(e => ({
      id: e.id,
      name: e.name,
      ...(e.logicalName ? { logicalName: e.logicalName } : {}),
      columns: e.columns.map(c => ({
        id: c.id,
        name: c.name,
        type: c.size ? `${c.type}(${c.size})` : c.type,
        ...(c.isPK ? { pk: true } : {}),
        ...(c.isFK ? { fk: true } : {}),
        ...(c.isNN ? { nn: true } : {}),
        ...(c.isUnique ? { unique: true } : {}),
        ...(c.refEntityId ? { ref: c.refEntityId } : {}),
      })),
    })),
    relationships: doc.relationships.map(r => ({
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      type: r.type,
    })),
  };
}
