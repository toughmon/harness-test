import type { RelationshipSides } from '../core/relationshipSides';
import type { TFunc } from './index';

// 관계 요약 라벨 — 예전에는 core에서 '식별'·'점선' 같은 조각을 코드로 이어붙였다.
// 조각 연결은 어순이 코드에 박히므로, 여기서는 조립 순서까지 사전(rel.sideLabel 템플릿)이
// 소유하게 한다. 로케일이 어순을 바꾸고 싶으면 템플릿만 고치면 된다.
export function labelForSides(sides: RelationshipSides, t: TFunc): string {
  return t('rel.sideLabel', {
    card: sides.childCardinality === 'many' ? '1:M' : '1:1',
    kind: t(sides.identifying ? 'rel.identifying' : 'rel.nonIdentifying'),
    parent: t(sides.parentOptional ? 'rel.dashed' : 'rel.solid'),
    child: t(sides.childOptional ? 'rel.dashed' : 'rel.solid'),
  });
}
