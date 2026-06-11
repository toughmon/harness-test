// 컬럼 단위 도구 — 추가/수정/삭제. FK는 관계에서만 자동 생성되므로 수동 isFK는 받지 않는다.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defineTool, ok, withCurrentDoc, REFRESH_NOTE } from '../helpers';
import { resolveEntity, resolveColumn } from '../refs';
import * as erdOps from '../shared';
import { COLUMN_TYPES } from '../shared';

const columnType = z.enum(COLUMN_TYPES as unknown as [string, ...string[]]);

export function registerColumnTools(server: McpServer): void {
  defineTool(server, 'add_column', {
    title: '컬럼 추가',
    description: '엔티티에 일반 컬럼을 추가합니다. (FK는 add_relationship으로 자동 생성)',
    inputSchema: {
      entity: z.string().describe('엔티티 id 또는 이름'),
      name: z.string().describe('컬럼 물리명(영문)'),
      logicalName: z.string().optional().describe('논리명(한글)'),
      type: columnType.optional().describe('데이터 타입 (기본 VARCHAR)'),
      size: z.string().optional().describe('크기/길이 (예: 255, 10,2)'),
      isPK: z.boolean().optional(),
      isNN: z.boolean().optional().describe('NOT NULL'),
      isUnique: z.boolean().optional(),
    },
  }, async (args) => {
    const result = await withCurrentDoc((doc) => {
      const e = resolveEntity(doc, args.entity);
      const col: Record<string, unknown> = { name: args.name };
      if (args.logicalName !== undefined) col.logicalName = args.logicalName;
      if (args.type !== undefined) col.type = args.type;
      if (args.size !== undefined) col.size = args.size;
      if (args.isPK !== undefined) col.isPK = args.isPK;
      if (args.isNN !== undefined) col.isNN = args.isNN;
      if (args.isUnique !== undefined) col.isUnique = args.isUnique;
      const r = erdOps.addColumn(doc, e.id, col);
      return { doc: r.doc, result: { entityId: e.id, columnId: r.columnId, name: args.name } };
    });
    return ok({ added: result }, REFRESH_NOTE);
  });

  defineTool(server, 'update_column', {
    title: '컬럼 수정',
    description: '컬럼의 이름·논리명·타입·크기·PK/NN/Unique 플래그를 변경합니다.',
    inputSchema: {
      entity: z.string().describe('엔티티 id 또는 이름'),
      column: z.string().describe('컬럼 id 또는 이름'),
      name: z.string().optional(),
      logicalName: z.string().optional(),
      type: columnType.optional(),
      size: z.string().optional(),
      isPK: z.boolean().optional(),
      isNN: z.boolean().optional(),
      isUnique: z.boolean().optional(),
    },
  }, async (args) => {
    const updates: Record<string, unknown> = {};
    for (const k of ['name', 'logicalName', 'type', 'size', 'isPK', 'isNN', 'isUnique'] as const) {
      if (args[k] !== undefined) updates[k] = args[k];
    }
    if (Object.keys(updates).length === 0) throw new Error('변경할 필드를 하나 이상 지정하세요.');
    const result = await withCurrentDoc((doc) => {
      const e = resolveEntity(doc, args.entity);
      const c = resolveColumn(e, args.column);
      return { doc: erdOps.updateColumn(doc, e.id, c.id, updates), result: { entityId: e.id, columnId: c.id, updated: updates } };
    });
    return ok({ updated: result }, REFRESH_NOTE);
  });

  defineTool(server, 'delete_column', {
    title: '컬럼 삭제',
    description: '엔티티에서 컬럼을 삭제합니다.',
    inputSchema: {
      entity: z.string().describe('엔티티 id 또는 이름'),
      column: z.string().describe('컬럼 id 또는 이름'),
    },
  }, async (args) => {
    const result = await withCurrentDoc((doc) => {
      const e = resolveEntity(doc, args.entity);
      const c = resolveColumn(e, args.column);
      return { doc: erdOps.deleteColumn(doc, e.id, c.id), result: { entityId: e.id, deletedColumnId: c.id } };
    });
    return ok({ deleted: result }, REFRESH_NOTE);
  });
}
