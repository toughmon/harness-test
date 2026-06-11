// id 또는 이름으로 엔티티/컬럼/관계를 찾는 헬퍼 — LLM이 불투명한 id 대신 이름으로
// 지정할 수 있게 한다. 이름이 중복되면 명확히 에러를 던져 id 사용을 유도.

import type { ErdDoc, Entity, Column, Relationship } from './shared';

export function resolveEntity(doc: ErdDoc, ref: string): Entity {
  const byId = doc.entities.find(e => e.id === ref);
  if (byId) return byId;
  const byName = doc.entities.filter(e => e.name === ref);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`엔티티 이름 '${ref}'가 여러 개입니다. id로 지정하세요.`);
  throw new Error(`엔티티를 찾을 수 없습니다: '${ref}'`);
}

export function resolveColumn(entity: Entity, ref: string): Column {
  const byId = entity.columns.find(c => c.id === ref);
  if (byId) return byId;
  const byName = entity.columns.filter(c => c.name === ref);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`'${entity.name}'에 컬럼 이름 '${ref}'가 여러 개입니다. id로 지정하세요.`);
  throw new Error(`'${entity.name}'에서 컬럼을 찾을 수 없습니다: '${ref}'`);
}

export function resolveRelationship(
  doc: ErdDoc,
  args: { relationship_id?: string; source?: string; target?: string }
): Relationship {
  if (args.relationship_id) {
    const r = doc.relationships.find(rel => rel.id === args.relationship_id);
    if (!r) throw new Error(`관계를 찾을 수 없습니다: ${args.relationship_id}`);
    return r;
  }
  if (args.source && args.target) {
    const s = resolveEntity(doc, args.source);
    const t = resolveEntity(doc, args.target);
    const matches = doc.relationships.filter(r => r.sourceId === s.id && r.targetId === t.id);
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) throw new Error(`'${args.source}' → '${args.target}' 관계가 없습니다.`);
    throw new Error(`'${args.source}' → '${args.target}' 관계가 여러 개입니다. relationship_id로 지정하세요.`);
  }
  throw new Error('relationship_id 또는 source+target을 지정하세요.');
}
