import { Position } from '@xyflow/react';
import { Relationship, EndpointAnchor, AnchorSide } from '../types/erd';

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

const SIDE_TO_POSITION: Record<AnchorSide, Position> = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
};

// 수동 앵커(면 + 오프셋) → 캔버스 좌표 + 연결 면.
// attachPoint와 동일한 면별 좌표 공식을 쓰되 오프셋은 정규화 비율(0~1)로 받는다.
export function anchorToPoint(rect: Rect, anchor: EndpointAnchor): { x: number; y: number; position: Position } {
  const off = clamp(anchor.offset, 0, 1);
  const position = SIDE_TO_POSITION[anchor.side];
  switch (anchor.side) {
    case 'left':   return { x: rect.x,          y: rect.y + rect.h * off, position };
    case 'right':  return { x: rect.x + rect.w, y: rect.y + rect.h * off, position };
    case 'top':    return { x: rect.x + rect.w * off, y: rect.y,          position };
    case 'bottom': return { x: rect.x + rect.w * off, y: rect.y + rect.h, position };
  }
}

// 캔버스 좌표 p를 rect의 가장 가까운 면에 스냅 → 앵커(면 + 정규화 오프셋).
// 오프셋은 모서리에서 EDGE_PADDING만큼 떨어지도록 클램프한다.
export function pointToAnchor(rect: Rect, p: { x: number; y: number }): EndpointAnchor {
  const dl = Math.abs(p.x - rect.x);
  const dr = Math.abs(p.x - (rect.x + rect.w));
  const dt = Math.abs(p.y - rect.y);
  const db = Math.abs(p.y - (rect.y + rect.h));
  const min = Math.min(dl, dr, dt, db);
  let side: AnchorSide;
  let raw: number;
  if (min === dl) { side = 'left';   raw = rect.h ? (p.y - rect.y) / rect.h : 0.5; }
  else if (min === dr) { side = 'right';  raw = rect.h ? (p.y - rect.y) / rect.h : 0.5; }
  else if (min === dt) { side = 'top';    raw = rect.w ? (p.x - rect.x) / rect.w : 0.5; }
  else { side = 'bottom'; raw = rect.w ? (p.x - rect.x) / rect.w : 0.5; }
  const len = side === 'left' || side === 'right' ? rect.h : rect.w;
  const pad = len > 0 ? EDGE_PADDING / len : 0;
  return { side, offset: clamp(raw, pad, 1 - pad) };
}

// 관계의 nodeId쪽 끝이 수동 앵커인지 — 슬롯 분산에서 제외할지 판단
function endAnchored(r: Relationship, nodeId: string): boolean {
  return (
    (nodeId === r.sourceId && !!r.sourceAnchor) ||
    (nodeId === r.targetId && !!r.targetAnchor)
  );
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

  // 이 노드의 같은 면에 붙는 모든 관계 수집 — 단, 이 노드 쪽 끝이 수동 앵커로 고정된
  // 관계는 슬롯 분산 대상에서 제외(고정점으로 자동 선이 흘러들지 않게).
  const siblings = relationships.filter(r => {
    const otherId =
      r.sourceId === nodeId ? r.targetId :
      r.targetId === nodeId ? r.sourceId : null;
    if (!otherId) return false;
    if (endAnchored(r, nodeId)) return false;
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

  // 끝마다 독립 처리 — 수동 앵커가 있으면 자동 계산(sideOf+attachPoint)을 우회한다.
  const s = rel.sourceAnchor
    ? anchorToPoint(srcRect, rel.sourceAnchor)
    : (() => {
        const position = sideOf(srcRect, tgtRect);
        const p = attachPoint(rel.sourceId, position, relId, relationships, rects);
        return { x: p.x, y: p.y, position };
      })();
  const t = rel.targetAnchor
    ? anchorToPoint(tgtRect, rel.targetAnchor)
    : (() => {
        const position = sideOf(tgtRect, srcRect);
        const p = attachPoint(rel.targetId, position, relId, relationships, rects);
        return { x: p.x, y: p.y, position };
      })();

  return {
    sourceX: s.x, sourceY: s.y, sourcePosition: s.position,
    targetX: t.x, targetY: t.y, targetPosition: t.position,
  };
}
