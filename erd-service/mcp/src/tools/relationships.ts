// 관계 단위 도구 — 추가(FK 자동생성)/타입변경/삭제.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defineTool, ok, withCurrentDoc, REFRESH_NOTE } from '../helpers';
import { resolveEntity, resolveRelationship } from '../refs';
import * as erdOps from '../shared';
import { RELATIONSHIP_LABELS, type RelationshipType } from '../shared';

const REL_TYPES = [
  'ONE_TO_MANY_IDENTIFYING',
  'ONE_TO_MANY_IDENTIFYING_SOLID',
  'ONE_TO_MANY_NON_IDENTIFYING',
  'ONE_TO_MANY_OPTIONAL',
  'ONE_TO_ONE_IDENTIFYING',
  'ONE_TO_ONE_IDENTIFYING_SOLID',
  'ONE_TO_ONE_NON_IDENTIFYING',
  'ONE_TO_ONE_OPTIONAL',
] as const;

const relType = z.enum(REL_TYPES);
const typeListDoc = REL_TYPES.map(t => `${t} = ${RELATIONSHIP_LABELS[t]}`).join('; ');

export function registerRelationshipTools(server: McpServer): void {
  defineTool(server, 'add_relationship', {
    title: '관계 추가',
    description:
      `상위(source) → 하위(target) 관계를 추가하고, 상위 PK를 하위에 FK 컬럼으로 자동 생성합니다. ` +
      `식별 관계는 FK가 하위 PK에 포함됩니다. 타입: ${typeListDoc}`,
    inputSchema: {
      source: z.string().describe('상위(부모) 엔티티 id 또는 이름'),
      target: z.string().describe('하위(자식) 엔티티 id 또는 이름'),
      type: relType.optional().describe('관계 타입 (기본 ONE_TO_MANY_NON_IDENTIFYING)'),
    },
  }, async (args) => {
    const type = (args.type ?? 'ONE_TO_MANY_NON_IDENTIFYING') as RelationshipType;
    const result = await withCurrentDoc((doc) => {
      const s = resolveEntity(doc, args.source);
      const t = resolveEntity(doc, args.target);
      const r = erdOps.addRelationship(doc, s.id, t.id, type);
      return {
        doc: r.doc,
        result: {
          relationshipId: r.relationshipId,
          source: s.id,
          target: t.id,
          type,
          fkColumnsAdded: r.fkColumnsAdded.map(c => ({ columnId: c.id, name: c.name, isPK: c.isPK, isNN: c.isNN })),
        },
      };
    });
    return ok({ added: result }, REFRESH_NOTE);
  });

  defineTool(server, 'update_relationship_type', {
    title: '관계 타입 변경',
    description:
      `관계 타입을 변경합니다(식별↔비식별 등). 기존 FK 컬럼은 플래그만 전환되어 보존됩니다. ` +
      `relationship_id 또는 source+target으로 관계를 지정하세요. 타입: ${typeListDoc}`,
    inputSchema: {
      relationship_id: z.string().optional(),
      source: z.string().optional(),
      target: z.string().optional(),
      type: relType,
    },
  }, async (args) => {
    const result = await withCurrentDoc((doc) => {
      const rel = resolveRelationship(doc, args);
      const r = erdOps.updateRelationshipType(doc, rel.id, args.type as RelationshipType);
      if (!r.changed) throw new Error('타입이 변경되지 않았습니다(동일 타입이거나 대상 없음).');
      return { doc: r.doc, result: { relationshipId: rel.id, type: args.type } };
    });
    return ok({ updated: result }, REFRESH_NOTE);
  });

  defineTool(server, 'delete_relationship', {
    title: '관계 삭제',
    description:
      '관계를 삭제하고, 이 관계로 자동 생성됐던 하위 FK 컬럼도 제거합니다. ' +
      'relationship_id 또는 source+target으로 지정하세요.',
    inputSchema: {
      relationship_id: z.string().optional(),
      source: z.string().optional(),
      target: z.string().optional(),
    },
  }, async (args) => {
    const result = await withCurrentDoc((doc) => {
      const rel = resolveRelationship(doc, args);
      const r = erdOps.deleteRelationship(doc, rel.id);
      return { doc: r.doc, result: { deletedRelationshipId: rel.id } };
    });
    return ok({ deleted: result }, REFRESH_NOTE);
  });
}
