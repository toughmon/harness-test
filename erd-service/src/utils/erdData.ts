import { Entity, Memo, Relationship, ERDData } from '../types/erd';

// ERDData(저장 포맷) ↔ 스토어 상태 변환 — fileIO(JSON 파일)와 diagramStore(DB 저장)가 공유

export function toERDData(
  entities: Entity[],
  relationships: Relationship[],
  positions: Record<string, { x: number; y: number }>,
  memos: Memo[] = []
): ERDData {
  return {
    version: '1.0',
    entities: entities.map(entity => ({
      entity,
      position: positions[entity.id] ?? { x: 0, y: 0 },
    })),
    relationships,
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
    entities: data.entities.map(e => e.entity),
    relationships: data.relationships,
    positions,
    memos: data.memos ?? [],
  };
}
