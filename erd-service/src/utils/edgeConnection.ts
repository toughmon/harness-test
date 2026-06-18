import { Position } from '@xyflow/react';
import { Relationship } from '../types/erd';

// 노드의 캔버스상 사각형 (위치 + 측정된 크기)
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeEndpoints {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
}

const SLOT_SPACING = 28;     // 같은 면에 붙는 연결점 사이 간격(px)
const EDGE_PADDING = 12;     // 면 양 끝 모서리에서 최소 이격(px)

function center(r: Rect) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

// 두 노드의 상대 위치로 연결할 면을 결정 — 서로 가까운 면끼리 마주보도록
function sideOf(from: Rect, to: Rect): Position {
  const f = center(from);
  const t = center(to);
  const dx = t.x - f.x;
  const dy = t.y - f.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? Position.Right : Position.Left;
  }
  return dy > 0 ? Position.Bottom : Position.Top;
}

// nodeId의 side 면에 붙는 관계들 중 relId의 슬롯을 계산해 연결점 좌표를 반환.
// 반대편 노드 위치 순으로 정렬하므로 같은 면에서 출발하는 선끼리 교차하지 않는다.
function attachPoint(
  nodeId: string,
  side: Position,
  relId: string,
  relationships: Relationship[],
  rects: Record<string, Rect>,
): { x: number; y: number } {
  const rect = rects[nodeId];
  const horizontal = side === Position.Left || side === Position.Right;

  // 이 노드의 같은 면에 붙는 모든 관계 수집
  const siblings = relationships.filter(r => {
    const otherId =
      r.sourceId === nodeId ? r.targetId :
      r.targetId === nodeId ? r.sourceId : null;
    if (!otherId) return false;
    const other = rects[otherId];
    return !!other && sideOf(rect, other) === side;
  });

  // 반대편 노드의 위치 순으로 정렬 (동일 좌표면 id로 안정 정렬)
  siblings.sort((a, b) => {
    const ac = center(rects[a.sourceId === nodeId ? a.targetId : a.sourceId]);
    const bc = center(rects[b.sourceId === nodeId ? b.targetId : b.sourceId]);
    const av = horizontal ? ac.y : ac.x;
    const bv = horizontal ? bc.y : bc.x;
    return av - bv || a.id.localeCompare(b.id);
  });

  const count = siblings.length;
  const index = Math.max(0, siblings.findIndex(r => r.id === relId));

  // 면 중앙 기준으로 SLOT_SPACING 간격 분산, 면 길이를 넘으면 간격을 줄여 클램프
  const len = horizontal ? rect.h : rect.w;
  const spacing = count > 1
    ? Math.min(SLOT_SPACING, (len - EDGE_PADDING * 2) / (count - 1))
    : 0;
  const along = clamp(
    len / 2 + (index - (count - 1) / 2) * spacing,
    EDGE_PADDING,
    len - EDGE_PADDING,
  );

  switch (side) {
    case Position.Left:   return { x: rect.x,          y: rect.y + along };
    case Position.Right:  return { x: rect.x + rect.w, y: rect.y + along };
    case Position.Top:    return { x: rect.x + along,  y: rect.y };
    case Position.Bottom: return { x: rect.x + along,  y: rect.y + rect.h };
  }
}

// 관계 하나의 양 끝 연결점과 연결 면을 계산한다.
// 노드 정보가 아직 없으면(측정 전 등) null을 반환해 호출부가 React Flow 기본값을 쓰게 한다.
export function computeEdgeEndpoints(
  relId: string,
  relationships: Relationship[],
  rects: Record<string, Rect>,
): EdgeEndpoints | null {
  const rel = relationships.find(r => r.id === relId);
  if (!rel) return null;
  const srcRect = rects[rel.sourceId];
  const tgtRect = rects[rel.targetId];
  if (!srcRect || !tgtRect) return null;

  // 자기 참조(재귀) — 우측 상단에서 나가 하단으로 들어오는 L자 루프
  if (rel.sourceId === rel.targetId) {
    return {
      sourceX: srcRect.x + srcRect.w,
      sourceY: srcRect.y + srcRect.h * 0.33,
      sourcePosition: Position.Right,
      targetX: srcRect.x + srcRect.w * 0.67,
      targetY: srcRect.y + srcRect.h,
      targetPosition: Position.Bottom,
    };
  }

  const sourcePosition = sideOf(srcRect, tgtRect);
  const targetPosition = sideOf(tgtRect, srcRect);

  const s = attachPoint(rel.sourceId, sourcePosition, relId, relationships, rects);
  const t = attachPoint(rel.targetId, targetPosition, relId, relationships, rects);

  return {
    sourceX: s.x, sourceY: s.y, sourcePosition,
    targetX: t.x, targetY: t.y, targetPosition,
  };
}
