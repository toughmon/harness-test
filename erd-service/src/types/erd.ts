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

// 관계선 끝점의 수동 부착 위치 — 엔티티 테두리의 한 면 + 그 면을 따라가는 정규화 오프셋(0~1).
// 절대좌표가 아닌 상대값이라 엔티티 이동·크기 변경에도 부착 위치가 따라간다.
export type AnchorSide = 'top' | 'bottom' | 'left' | 'right';
export interface EndpointAnchor {
  side: AnchorSide;
  offset: number;   // 0~1, 해당 면의 시작(좌/상)에서의 비율
}

// 관계선 중간 우회(꺾기) 오프셋 — 자동 중간점에서 얼마나 밀어냈는지(캔버스 px).
// 절대좌표가 아니라 '자동 중간점 기준 상대값'이라 엔티티를 옮겨도 우회 모양이 따라간다.
export interface MidOffset {
  x: number;
  y: number;
  // 우회선까지 이어지는 '다리' 구간의 보조축 오프셋 — 부모/자식 쪽을 각각 독립으로 옮긴다.
  // 없으면 구버전 호환으로 x/y의 보조축 성분(양쪽 공통)을 사용한다.
  sourceLeg?: number;
  targetLeg?: number;
}

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
  // ── 끝점 수동 부착 위치 — 없으면 자동(sideOf+슬롯 분산). 더블클릭으로 제거(자동 복귀) ──
  sourceAnchor?: EndpointAnchor;       // 부모(source) 끝점 수동 위치
  targetAnchor?: EndpointAnchor;       // 자식(target) 끝점 수동 위치
  // ── 중간 우회(꺾기) — 선을 상/하(좌/우)로 드래그해 다른 엔티티를 피해가게 한다.
  //    없으면 기존 자동 경로(smoothstep). 선 더블클릭으로 제거(자동 복귀) ──
  midOffset?: MidOffset;
  // ── 서브타입 스코프 — 이 관계가 특정 서브타입 전용임을 표시. optional이라 기존 저장 파일과 호환 ──
  sourceSubtypeId?: string;  // 부모가 특정 서브타입일 때(라벨 표시용 — 서브타입은 PK가 없어 FK 생성엔 영향 없음)
  targetSubtypeId?: string;  // 자식이 특정 서브타입 전용일 때 — 자동 FK 컬럼이 그 서브타입의 columns에 위치
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
