// 상위 앱(src/)의 순수 ERD 로직·직렬화·타입을 MCP 서버로 다시 노출하는 브리지.
// Zustand store와 MCP가 동일한 erdOps를 쓰게 해 로직 불일치(drift)를 막는다.
export * from '../../src/core/erdOps';
export { toERDData, fromERDData } from '../../src/utils/erdData';
export { RELATIONSHIP_LABELS, COLUMN_TYPES, ENTITY_COLORS } from '../../src/types/erd';
export type {
  Entity,
  Column,
  Relationship,
  RelationshipType,
  ColumnType,
  Subtype,
  ERDData,
} from '../../src/types/erd';
