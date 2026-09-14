import { Entity, Memo, Relationship, ERDData } from '../types/erd';

// ERDData(저장 포맷) ↔ 스토어 상태 변환 — fileIO(JSON 파일)와 diagramStore(DB 저장)가 공유

// 제거된 전용 필드는 구 저장 파일에서 버린다.
// 기존 다이어그램은 일반 엔티티/관계로 열리며, 전용 컬럼·스코프는 복원하지 않는다.
function cleanEntity(entity: Entity): Entity {
  const { id, name, logicalName, description, color, columns } = entity;
  return { id, name, logicalName, description, color, columns };
}

function cleanRelationship(relationship: Relationship): Relationship {
  const {
    id,
    sourceId,
    targetId,
    type,
    parentOptional,
    childOptional,
    childCardinality,
    identifying,
    sourceAnchor,
    targetAnchor,
    midOffset,
  } = relationship;
  return {
    id,
    sourceId,
    targetId,
    type,
    parentOptional,
    childOptional,
    childCardinality,
    identifying,
    sourceAnchor,
    targetAnchor,
    midOffset,
  };
}

export function toERDData(
  entities: Entity[],
  relationships: Relationship[],
  positions: Record<string, { x: number; y: number }>,
  memos: Memo[] = []
): ERDData {
  return {
    version: '1.0',
    entities: entities.map(entity => ({
      entity: cleanEntity(entity),
      position: positions[entity.id] ?? { x: 0, y: 0 },
    })),
    relationships: relationships.map(cleanRelationship),
    memos,
  };
}

export function fromERDData(data: ERDData): {
  entities: Entity[];
  relationships: Relationship[];
  positions: Record<string, { x: number; y: number }>;
  memos: Memo[];
} {
  const positions: Record<string, { x: number; y: number }> = {};
  data.entities.forEach(({ entity, position }) => {
    positions[entity.id] = position;
  });
  return {
    entities: data.entities.map(e => cleanEntity(e.entity)),
    relationships: data.relationships.map(cleanRelationship),
    positions,
    memos: data.memos ?? [],
  };
}
