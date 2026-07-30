import { Position } from '@xyflow/react';
import { Relationship, EndpointAnchor, AnchorSide, MidOffset } from '../types/erd';

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
const BEND_STUB = 24;        // 우회 경로에서 엔티티 테두리를 직각으로 빠져나오는 직선 길이(px)

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

// ──────────────────────────────────────────────────────────────────────────
// 중간 우회(꺾기) 경로 — 선 중간을 드래그해 다른 엔티티를 피해가게 한다.
// 자동 경로(getSmoothStepPath)는 두 엔티티 사이를 최단으로 지나가므로 그 사이에 놓인
// 제3의 엔티티를 피할 수 없다. 우회 오프셋이 있으면 직각 5구간 경로로 대체한다:
//   엔티티에서 직각으로 STUB만큼 나온 뒤 → 우회 축까지 이동 → 우회선을 따라 횡단 →
//   반대쪽 STUB로 내려와 → 엔티티로 진입.
// ──────────────────────────────────────────────────────────────────────────

interface Pt { x: number; y: number }

const NORMALS: Record<Position, [number, number]> = {
  [Position.Left]:   [-1, 0],
  [Position.Right]:  [1, 0],
  [Position.Top]:    [0, -1],
  [Position.Bottom]: [0, 1],
};

// 우회 경로에서 독립적으로 끌 수 있는 구간 — 잡은 구간만 움직인다(반대쪽은 그대로).
export type BendPart = 'channel' | 'sourceLeg' | 'targetLeg';

export interface BendSegment {
  part: BendPart;
  orientation: 'h' | 'v';   // 구간이 놓인 방향 — 드래그는 이와 수직으로만 의미가 있다
  a: Pt;
  b: Pt;
}

export interface BendRoute {
  path: string;
  labelX: number;      // 우회선(중간 구간)의 중앙 — ✎ 아이콘 위치
  labelY: number;
  axis: 'x' | 'y';     // 주축 — 좌우 배치면 'y'(우회선이 수평, 상/하로 이동)
  segments: BendSegment[];
}

// 다리 오프셋 읽기 — per-side 값이 없으면 구버전(양쪽 공통) 보조축 성분으로 폴백
export function legOffsetOf(offset: MidOffset, axis: 'x' | 'y', end: 'source' | 'target'): number {
  const legacy = axis === 'y' ? offset.x : offset.y;
  return (end === 'source' ? offset.sourceLeg : offset.targetLeg) ?? legacy;
}

// 드래그 결과를 오프셋에 반영 — 잡은 구간에 해당하는 값만 바뀐다.
// 우회선은 주축으로만, 다리는 보조축으로만 움직인다(구간과 수직인 방향).
export function applyBendDrag(
  base: MidOffset,
  axis: 'x' | 'y',
  part: BendPart,
  dx: number,
  dy: number,
): MidOffset {
  const next: MidOffset = { ...base };
  if (part === 'channel') {
    if (axis === 'y') next.y = base.y + dy;
    else next.x = base.x + dx;
    return next;
  }
  const d = axis === 'y' ? dx : dy;
  const end = part === 'sourceLeg' ? 'source' : 'target';
  const moved = legOffsetOf(base, axis, end) + d;
  if (end === 'source') next.sourceLeg = moved;
  else next.targetLeg = moved;
  return next;
}

// 점 p에서 가장 가까운 구간 — pointerdown 지점으로 어느 구간을 잡았는지 판단한다
export function nearestBendSegment(segments: BendSegment[], p: Pt): BendSegment | null {
  let best: BendSegment | null = null;
  let bestD = Infinity;
  for (const seg of segments) {
    const vx = seg.b.x - seg.a.x, vy = seg.b.y - seg.a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 ? clamp(((p.x - seg.a.x) * vx + (p.y - seg.a.y) * vy) / len2, 0, 1) : 0;
    const d = Math.hypot(p.x - (seg.a.x + vx * t), p.y - (seg.a.y + vy * t));
    if (d < bestD) { bestD = d; best = seg; }
  }
  return best;
}

// 드래그가 의미를 갖는 축은 '연결 면'이 아니라 두 끝점의 실제 진행 방향으로 판정한다.
// 가로로 멀리 떨어져 있으면(좌우 배치) 두 엔티티를 잇는 긴 구간이 수평선이므로 상/하(y) 드래그,
// 세로로 떨어져 있으면 긴 구간이 수직선이므로 좌/우(x) 드래그.
// ※ 면으로 판정하면 '양쪽 끝점이 모두 하단 면에 붙은 좌우 배치'처럼 선은 가로로 달리는데
//    축이 x로 잡혀 상/하 드래그가 먹지 않는 경우가 생긴다.
export function bendAxis(s: Pt, t: Pt): 'x' | 'y' {
  return Math.abs(t.x - s.x) >= Math.abs(t.y - s.y) ? 'y' : 'x';
}

// 연속된 중복점·직선상의 불필요한 중간점 제거 (0길이 구간이 모서리 라운딩을 깨뜨리지 않게)
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  const res: Pt[] = [];
  for (let i = 0; i < out.length; i++) {
    const a = res[res.length - 1];
    const b = out[i];
    const c = out[i + 1];
    // a-b-c가 일직선이면 b는 버린다
    if (a && c) {
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 0.01) continue;
    }
    res.push(b);
  }
  return res;
}

// 꺾인 폴리라인 → 모서리를 둥글린 SVG path (자동 경로의 borderRadius=8과 같은 느낌)
function roundedPolyline(pts: Pt[], r: number): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], p = pts[i], b = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const rr = Math.min(r, la / 2, lb / 2);
    if (rr < 0.5) { d += ` L ${p.x} ${p.y}`; continue; }
    d += ` L ${p.x + ((a.x - p.x) / la) * rr} ${p.y + ((a.y - p.y) / la) * rr}`;
    d += ` Q ${p.x} ${p.y} ${p.x + ((b.x - p.x) / lb) * rr} ${p.y + ((b.y - p.y) / lb) * rr}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

// 우회 오프셋을 반영한 직각 경로를 만든다. offset이 {0,0}이면
// (같은 면끼리 마주보고 정렬된 흔한 경우) 결과는 자동 경로와 같은 직선이 된다.
export function buildBendRoute(
  s: { x: number; y: number; position: Position },
  t: { x: number; y: number; position: Position },
  offset: MidOffset,
  radius = 8,
): BendRoute {
  const axis = bendAxis(s, t);
  const [snx, sny] = NORMALS[s.position] ?? [1, 0];
  const [tnx, tny] = NORMALS[t.position] ?? [-1, 0];
  const s1 = { x: s.x + snx * BEND_STUB, y: s.y + sny * BEND_STUB };
  const t1 = { x: t.x + tnx * BEND_STUB, y: t.y + tny * BEND_STUB };

  // 오프셋 0의 기준선 — 양 끝이 같은 방향(둘 다 아래/위, 둘 다 좌/우)으로 나가면
  // 그 바깥쪽 stub을 기준으로 삼아, 자동 경로와 같은 모양에서 드래그가 시작되게 한다.
  const baseY = sny > 0 && tny > 0 ? Math.max(s1.y, t1.y)
    : sny < 0 && tny < 0 ? Math.min(s1.y, t1.y)
    : (s.y + t.y) / 2;
  const baseX = snx > 0 && tnx > 0 ? Math.max(s1.x, t1.x)
    : snx < 0 && tnx < 0 ? Math.min(s1.x, t1.x)
    : (s.x + t.x) / 2;
  const midX = baseX + offset.x;
  const midY = baseY + offset.y;

  // 다리(우회선까지 이어지는 구간)는 부모/자식 각각 독립 오프셋을 갖는다 — 한쪽을 끌어도
  // 반대쪽은 그대로. 면 법선이 그 축과 같으면(예: 우측 면 + 좌/우 이동) 다리가 자기 엔티티를
  // 관통하지 않도록 면 바깥 8px까지만 허용한다(상/하 면은 stub이 이미 밖이라 제약 불필요).
  const outside = (v: number, edge: number, n: number) =>
    n > 0 ? Math.max(edge + 8, v) : n < 0 ? Math.min(edge - 8, v) : v;
  const legS = legOffsetOf(offset, axis, 'source');
  const legT = legOffsetOf(offset, axis, 'target');
  const legSX = outside(s1.x + legS, s.x, snx);
  const legTX = outside(t1.x + legT, t.x, tnx);
  const legSY = outside(s1.y + legS, s.y, sny);
  const legTY = outside(t1.y + legT, t.y, tny);

  // axis='y': 우회선이 midY의 수평선, 다리는 legSX/legTX의 수직선.
  // 다리 오프셋이 0이면 leg == stub 지점이라 점이 중복 제거되어 기존 경로와 동일해진다.
  const pts: Pt[] = axis === 'y'
    ? [s, s1, { x: legSX, y: s1.y }, { x: legSX, y: midY }, { x: legTX, y: midY }, { x: legTX, y: t1.y }, t1, t]
    : [s, s1, { x: s1.x, y: legSY }, { x: midX, y: legSY }, { x: midX, y: legTY }, { x: t1.x, y: legTY }, t1, t];

  const segments: BendSegment[] = axis === 'y'
    ? [
        { part: 'sourceLeg', orientation: 'v', a: { x: legSX, y: s1.y }, b: { x: legSX, y: midY } },
        { part: 'channel',   orientation: 'h', a: { x: legSX, y: midY }, b: { x: legTX, y: midY } },
        { part: 'targetLeg', orientation: 'v', a: { x: legTX, y: midY }, b: { x: legTX, y: t1.y } },
      ]
    : [
        { part: 'sourceLeg', orientation: 'h', a: { x: s1.x, y: legSY }, b: { x: midX, y: legSY } },
        { part: 'channel',   orientation: 'v', a: { x: midX, y: legSY }, b: { x: midX, y: legTY } },
        { part: 'targetLeg', orientation: 'h', a: { x: midX, y: legTY }, b: { x: t1.x, y: legTY } },
      ];

  return {
    path: roundedPolyline(simplify(pts), radius),
    labelX: axis === 'y' ? (legSX + legTX) / 2 : midX,
    labelY: axis === 'y' ? midY : (legSY + legTY) / 2,
    axis,
    segments,
  };
}
