export const COLUMN_TYPES = [
  'VARCHAR', 'INT', 'BIGINT', 'BOOLEAN', 'TEXT',
  'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT',
  'CHAR', 'SMALLINT', 'TINYINT', 'UUID', 'JSON', 'BLOB',
] as const;

export type ColumnType = typeof COLUMN_TYPES[number];

export interface Column {
  id: string;
  name: string;           // 물리명 (영문)
  logicalName?: string;   // 논리명 (한글 명칭)
  type: ColumnType;
  size: string;
  isPK: boolean;
  isFK: boolean;
  isNN: boolean;
  isUnique: boolean;
  refEntityId?: string;
  refColumnId?: string;
}

// 배타적 서브타입 — 슈퍼타입(Entity) 안에 중첩되는 하위 엔티티.
// PK는 슈퍼타입과 공유하므로 자체 PK는 두지 않고 고유 속성 컬럼만 가진다.
export interface Subtype {
  id: string;
  name: string;           // 물리명 (영문)
  logicalName?: string;   // 논리명 (한글 명칭)
  columns: Column[];      // 서브타입 고유 속성
}

export interface Entity {
  id: string;
  name: string;           // 물리명 (영문 테이블명)
  logicalName?: string;   // 논리명 (한글 명칭)
  description?: string;   // 설명/메모
  color: string;
  columns: Column[];
  // ── 배타적 서브타입(SubSet) — 모두 optional이라 기존 저장 파일과 호환 ──
  subsetName?: string;        // SubSet 그룹 이름 (구분자/판별자 이름으로도 사용)
  subtypes?: Subtype[];       // 중첩 서브타입 목록
  subtypeExclusive?: boolean; // true=배타(겹침 없음, 기본) / false=포함(중첩 허용)
  subtypeComplete?: boolean;  // true=완전(반드시 한 서브타입) / false=불완전(슈퍼타입만 가능, 기본)
}

export type RelationshipType =
  | 'ONE_TO_MANY_IDENTIFYING'
  | 'ONE_TO_MANY_IDENTIFYING_SOLID'
  | 'ONE_TO_MANY_NON_IDENTIFYING'
  | 'ONE_TO_MANY_OPTIONAL'
  | 'ONE_TO_ONE_IDENTIFYING'
  | 'ONE_TO_ONE_IDENTIFYING_SOLID'
  | 'ONE_TO_ONE_NON_IDENTIFYING'
  | 'ONE_TO_ONE_OPTIONAL';

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  ONE_TO_MANY_IDENTIFYING: '1:M 식별자 상속 (점선 + 실선)',
  ONE_TO_MANY_IDENTIFYING_SOLID: '1:M 식별자 상속 (실선 + 실선)',
  ONE_TO_MANY_NON_IDENTIFYING: '1:M 비식별 (점선 + 실선)',
  ONE_TO_MANY_OPTIONAL: '1:M 비식별 (점선 + 점선)',
  ONE_TO_ONE_IDENTIFYING: '1:1 식별자 상속 (점선 + 실선)',
  ONE_TO_ONE_IDENTIFYING_SOLID: '1:1 식별자 상속 (실선 + 실선)',
  ONE_TO_ONE_NON_IDENTIFYING: '1:1 비식별 (점선 + 실선)',
  ONE_TO_ONE_OPTIONAL: '1:1 비식별 (점선 + 점선)',
};

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  // ── per-side(좌/우 절반) 명시 속성 — 모두 optional이라 기존 저장 파일과 호환 ──
  // 있으면 렌더·FK의 단일 진실 원천이 되고, 없으면 type에서 파생(core/relationshipSides).
  // type은 호환/생성 프리셋용으로 항상 유지된다(가장 근접한 enum).
  parentOptional?: boolean;            // 부모(좌) 절반 점선 = 선택 참여
  childOptional?: boolean;             // 자식(우) 절반 점선 = 선택 참여(FK NULL 허용)
  childCardinality?: 'one' | 'many';   // 자식쪽 카디널리티 (까마귀발 유무)
  identifying?: boolean;               // FK가 자식 PK에 포함(식별 관계)
}

export interface Memo {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export const MEMO_COLORS = [
  '#fef08a', // yellow
  '#bbf7d0', // green
  '#bae6fd', // sky
  '#fecaca', // red
  '#e9d5ff', // purple
  '#fed7aa', // orange
];

export interface ERDData {
  version: string;
  entities: Array<{ entity: Entity; position: { x: number; y: number } }>;
  relationships: Relationship[];
  memos?: Memo[];
}

export const ENTITY_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48', // rose
  '#a855f7', // purple
];
