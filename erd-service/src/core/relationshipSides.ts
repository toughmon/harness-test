import { Relationship, RelationshipType } from '../types/erd';

// ──────────────────────────────────────────────────────────────────────────
// 관계선의 좌(부모)/우(자식) 절반 속성 — 단일 enum RelationshipType이 묶어 인코딩하던
// 카디널리티·식별·선스타일을 per-side로 분해/합성한다. 프레임워크 비의존 순수 함수만 둔다
// (erdOps와 동일 원칙, 순환 import 방지를 위해 erdOps에 의존하지 않는다).
//
// 진실의 원천: Relationship에 명시 필드(parentOptional 등)가 있으면 그것, 없으면 type에서
// 파생(deriveSides). 편집은 applySides로 명시 필드를 갱신하면서 호환용 type을 재계산한다.
// ──────────────────────────────────────────────────────────────────────────

export interface RelationshipSides {
  parentOptional: boolean;          // 부모(좌) 절반 점선 = 선택 참여
  childOptional: boolean;           // 자식(우) 절반 점선 = 선택 참여(FK NULL 허용)
  childCardinality: 'one' | 'many'; // 자식쪽 카디널리티
  identifying: boolean;             // FK가 자식 PK에 포함
}

const IDENTIFYING_TYPES: readonly RelationshipType[] = [
  'ONE_TO_MANY_IDENTIFYING',
  'ONE_TO_MANY_IDENTIFYING_SOLID',
  'ONE_TO_ONE_IDENTIFYING',
  'ONE_TO_ONE_IDENTIFYING_SOLID',
];

// enum type → per-side (명시 필드 없는 구 데이터 하위호환). 현 RelationshipEdge/erdOps 의미 그대로:
// - 1:M 여부 = 'ONE_TO_MANY' 접두사
// - 식별 = IDENTIFYING 계열
// - 부모 절반 점선 = SOLID 계열이 아닐 때(SOLID만 부모도 실선)
// - 자식 절반 점선 = OPTIONAL 계열일 때만
export function sidesFromType(type: RelationshipType): RelationshipSides {
  return {
    childCardinality: type.startsWith('ONE_TO_MANY') ? 'many' : 'one',
    identifying: IDENTIFYING_TYPES.includes(type),
    parentOptional: !type.endsWith('_IDENTIFYING_SOLID'),
    childOptional: type.endsWith('_OPTIONAL'),
  };
}

// 관계 → per-side: 명시 필드 우선, 없으면 type에서 파생
export function deriveSides(rel: Relationship): RelationshipSides {
  const base = sidesFromType(rel.type);
  return {
    parentOptional: rel.parentOptional ?? base.parentOptional,
    childOptional: rel.childOptional ?? base.childOptional,
    childCardinality: rel.childCardinality ?? base.childCardinality,
    identifying: rel.identifying ?? base.identifying,
  };
}

// per-side → 가장 근접한 enum type (호환/생성 프리셋·라벨용).
// enum이 표현하는 8조합은 round-trip 보존되고, enum에 없는 조합은 근사값이 된다
// (렌더·FK는 명시 필드를 읽으므로 화면/스키마는 정확).
export function sidesToType(sides: RelationshipSides): RelationshipType {
  const prefix = sides.childCardinality === 'many' ? 'ONE_TO_MANY' : 'ONE_TO_ONE';
  let suffix: string;
  if (sides.childOptional) suffix = 'OPTIONAL';
  else if (sides.identifying) suffix = sides.parentOptional ? 'IDENTIFYING' : 'IDENTIFYING_SOLID';
  else suffix = 'NON_IDENTIFYING';
  return `${prefix}_${suffix}` as RelationshipType;
}

// FK 컬럼 플래그 — 식별: PK 포함, 자식 선택: NULL 허용 (기존 fkFlagsFor와 동일 의미)
export function fkFlagsForSides(sides: RelationshipSides): { isPK: boolean; isNN: boolean } {
  return { isPK: sides.identifying, isNN: !sides.childOptional };
}

// per-side 부분 갱신 → 명시 필드 저장 + 호환 type 재계산
export function applySides(rel: Relationship, partial: Partial<RelationshipSides>): Relationship {
  const next: RelationshipSides = { ...deriveSides(rel), ...partial };
  // 불변식: 식별 관계는 자식 FK가 PK에 포함(NOT NULL)되므로 자식 선택참여(점선·NULL 허용)와
  // 양립 불가 → 자식이 점선(childOptional)이면 식별을 강제 해제한다. 자식이 서브타입 전용
  // (targetSubtypeId)이어도 마찬가지 — 서브타입 컬럼은 그 서브타입일 때만 존재하는 조건부
  // 컬럼이라 모든 로우에 필수인 PK가 될 수 없다.
  if (next.childOptional || rel.targetSubtypeId) next.identifying = false;
  return {
    ...rel,
    parentOptional: next.parentOptional,
    childOptional: next.childOptional,
    childCardinality: next.childCardinality,
    identifying: next.identifying,
    type: sidesToType(next),
  };
}

// 사람이 읽는 요약 라벨 (패널 표시용)
export function labelForSides(sides: RelationshipSides): string {
  const card = sides.childCardinality === 'many' ? '1:M' : '1:1';
  const kind = sides.identifying ? '식별' : '비식별';
  const p = sides.parentOptional ? '점선' : '실선';
  const c = sides.childOptional ? '점선' : '실선';
  return `${card} ${kind} (${p} + ${c})`;
}
