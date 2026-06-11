// 엔티티 단위 도구 — 추가/수정/삭제. 변형은 erdOps 순수 함수에 위임.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defineTool, ok, withCurrentDoc, REFRESH_NOTE } from '../helpers';
import { resolveEntity } from '../refs';
import * as erdOps from '../shared';

export function registerEntityTools(server: McpServer): void {
  defineTool(server, 'add_entity', {
    title: '엔티티 추가',
    description: '엔티티(테이블)를 추가합니다. 기본으로 id INT PK 컬럼이 함께 생성됩니다.',
    inputSchema: {
      name: z.string().optional().describe('물리명(영문). 생략 시 Entity{N}'),
      logicalName: z.string().optional().describe('논리명(한글)'),
      description: z.string().optional(),
      color: z.string().optional().describe('hex 색상 (예: #3b82f6)'),
      withDefaultId: z.boolean().optional().describe('기본 id PK 컬럼 자동 추가 (기본 true)'),
    },
  }, async (args) => {
    const result = await withCurrentDoc((doc) => {
      const r = erdOps.addEntity(doc, {
        name: args.name,
        logicalName: args.logicalName,
        description: args.description,
        color: args.color,
        withDefaultId: args.withDefaultId,
      });
      const created = r.doc.entities.find(e => e.id === r.entityId)!;
      return { doc: r.doc, result: { entityId: r.entityId, name: created.name } };
    });
    return ok({ added: result }, REFRESH_NOTE);
  });

  defineTool(server, 'update_entity', {
    title: '엔티티 수정',
    description: '엔티티의 이름·논리명·설명·색상을 변경합니다. (컬럼은 컬럼 도구로 변경)',
    inputSchema: {
      entity: z.string().describe('엔티티 id 또는 이름'),
      name: z.string().optional(),
      logicalName: z.string().optional(),
      description: z.string().optional(),
      color: z.string().optional(),
    },
  }, async (args) => {
    const updates: Record<string, unknown> = {};
    for (const k of ['name', 'logicalName', 'description', 'color'] as const) {
      if (args[k] !== undefined) updates[k] = args[k];
    }
    if (Object.keys(updates).length === 0) throw new Error('변경할 필드를 하나 이상 지정하세요.');
    const result = await withCurrentDoc((doc) => {
      const e = resolveEntity(doc, args.entity);
      return { doc: erdOps.updateEntity(doc, e.id, updates), result: { entityId: e.id, updated: updates } };
    });
    return ok({ updated: result }, REFRESH_NOTE);
  });

  defineTool(server, 'delete_entity', {
    title: '엔티티 삭제',
    description: '엔티티를 삭제합니다. 연결된 관계와, 다른 엔티티에 남은 이 엔티티 참조 FK 컬럼도 함께 제거됩니다.',
    inputSchema: { entity: z.string().describe('엔티티 id 또는 이름') },
  }, async (args) => {
    const result = await withCurrentDoc((doc) => {
      const e = resolveEntity(doc, args.entity);
      const removedRels = doc.relationships
        .filter(r => r.sourceId === e.id || r.targetId === e.id)
        .map(r => r.id);
      return { doc: erdOps.deleteEntity(doc, e.id), result: { deletedEntityId: e.id, removedRelationshipIds: removedRels } };
    });
    return ok({ deleted: result }, REFRESH_NOTE);
  });
}
