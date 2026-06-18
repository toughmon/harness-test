import { memo, useMemo } from 'react';
import {
  EdgeProps,
  getSmoothStepPath,
  Position,
  useNodes,
} from '@xyflow/react';
import { Relationship } from '../../types/erd';
import { useERDStore } from '../../store/erdStore';
import { deriveSides } from '../../core/relationshipSides';
import { computeEdgeEndpoints, Rect } from '../../utils/edgeConnection';

const EDGE_COLOR = '#7d7c8c';
const EDGE_SELECTED = '#a78bfa';   // 선택 시 더 선명한 보라
const M = 14;  // crow's foot size
const B = 6;   // bar offset from path end

// 자기 참조 관계 — 우하단 모퉁이를 감싸는 사각 루프 path
function selfLoopPath(sX: number, sY: number, tX: number, tY: number): string {
  const r = 8;
  const ox = Math.max(sX, tX) + 50;  // 루프 오른쪽 끝
  const oy = Math.max(sY, tY) + 50;  // 루프 아래쪽 끝
  return [
    `M ${sX} ${sY}`,
    `L ${ox - r} ${sY}`,
    `Q ${ox} ${sY} ${ox} ${sY + r}`,
    `L ${ox} ${oy - r}`,
    `Q ${ox} ${oy} ${ox - r} ${oy}`,
    `L ${tX + r} ${oy}`,
    `Q ${tX} ${oy} ${tX} ${oy - r}`,
    `L ${tX} ${tY}`,
  ].join(' ');
}

// 바커 표기법 — 선의 좌/우 절반을 독립적으로 그린다:
// 부모(source, 좌) 절반은 parentOptional이면 점선·아니면 실선,
// 자식(target, 우) 절반은 childOptional이면 점선·아니면 실선.
// (양쪽 다 실선이면 오버레이 없이 단일 실선 path 하나로 렌더 — 기존 SOLID 동작 유지)

// CrowsFoot markers at target end, extending away from entity
function CrowsFoot({ x, y, pos, isIdentifying, color }: {
  x: number; y: number; pos: Position; isIdentifying: boolean; color: string
}) {
  const c = color;
  const sw = 1.5;

  // Direction vectors based on handle position
  // For Position.Left: handle on left side, edge arrives from left → markers extend LEFT
  const dirs: Record<Position, [number, number]> = {
    [Position.Left]:   [-1, 0],
    [Position.Right]:  [1, 0],
    [Position.Top]:    [0, -1],
    [Position.Bottom]: [0, 1],
  };
  const perps: Record<Position, [number, number]> = {
    [Position.Left]:   [0, 1],
    [Position.Right]:  [0, 1],
    [Position.Top]:    [1, 0],
    [Position.Bottom]: [1, 0],
  };

  const [dx, dy] = dirs[pos] ?? [-1, 0];
  const [px, py] = perps[pos] ?? [0, 1];
  // 까마귀발은 엔티티 쪽을 향한다: 선 위의 한 점(base)에서 모여 발끝이 엔티티 경계에 닿음
  const baseX = x + dx * M;
  const baseY = y + dy * M;
  const uidX = x + dx * (M + B);
  const uidY = y + dy * (M + B);

  return (
    <g>
      {/* Crow's foot: three prongs converging away from entity, toes touching the entity */}
      <line x1={baseX} y1={baseY} x2={x + px * M * 0.6} y2={y + py * M * 0.6} stroke={c} strokeWidth={sw} />
      <line x1={baseX} y1={baseY} x2={x}                y2={y}                stroke={c} strokeWidth={sw} />
      <line x1={baseX} y1={baseY} x2={x - px * M * 0.6} y2={y - py * M * 0.6} stroke={c} strokeWidth={sw} />
      {/* Uid bar: 식별 관계일 때 하위 엔티티 쪽에 하나의 선 */}
      {isIdentifying && (
        <line
          x1={uidX + px * 8} y1={uidY + py * 8}
          x2={uidX - px * 8} y2={uidY - py * 8}
          stroke={c} strokeWidth={sw}
        />
      )}
    </g>
  );
}

// 1:1 target marker (single bar)
function OneTargetMarker({ x, y, pos, isIdentifying, color }: {
  x: number; y: number; pos: Position; isIdentifying: boolean; color: string
}) {
  const c = color;
  const sw = 1.5;
  const perps: Record<Position, [number, number]> = {
    [Position.Left]:   [0, 1],
    [Position.Right]:  [0, 1],
    [Position.Top]:    [1, 0],
    [Position.Bottom]: [1, 0],
  };
  const dirs: Record<Position, [number, number]> = {
    [Position.Left]:   [-1, 0],
    [Position.Right]:  [1, 0],
    [Position.Top]:    [0, -1],
    [Position.Bottom]: [0, 1],
  };
  const [dx, dy] = dirs[pos] ?? [-1, 0];
  const [px, py] = perps[pos] ?? [0, 1];
  const b1X = x + dx * B;
  const b1Y = y + dy * B;

  return (
    <g>
      {/* 하위 엔티티 쪽: 식별 관계일 때만 uid bar 하나 */}
      {isIdentifying && (
        <line x1={b1X + px * 8} y1={b1Y + py * 8} x2={b1X - px * 8} y2={b1Y - py * 8} stroke={c} strokeWidth={sw} />
      )}
    </g>
  );
}

function RelationshipEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
  selected,
}: EdgeProps) {
  const rel = data as unknown as Relationship;
  const { relationships } = useERDStore();

  // 노드 위치/크기를 직접 읽어 연결점을 동적으로 계산
  // — 같은 면에 여러 관계가 붙으면 연결점을 분산시켜 선이 겹치지 않게 한다
  const nodes = useNodes();
  const rects = useMemo(() => {
    const m: Record<string, Rect> = {};
    for (const n of nodes) {
      m[n.id] = {
        x: n.position.x,
        y: n.position.y,
        w: n.measured?.width ?? 180,
        h: n.measured?.height ?? 80,
      };
    }
    return m;
  }, [nodes]);

  const geo = useMemo(
    () => computeEdgeEndpoints(id, relationships, rects),
    [id, relationships, rects],
  );

  // 계산 불가 시(노드 측정 전 등) React Flow가 넘겨준 기본 좌표로 폴백
  const sX = geo?.sourceX ?? sourceX;
  const sY = geo?.sourceY ?? sourceY;
  const tX = geo?.targetX ?? targetX;
  const tY = geo?.targetY ?? targetY;
  const sPos = geo?.sourcePosition ?? sourcePosition;
  const tPos = geo?.targetPosition ?? targetPosition;

  const isSelfLoop = rel?.sourceId === rel?.targetId;
  const edgePath = isSelfLoop
    ? selfLoopPath(sX, sY, tX, tY)
    : getSmoothStepPath({
        sourceX: sX, sourceY: sY, sourcePosition: sPos,
        targetX: tX, targetY: tY, targetPosition: tPos,
        borderRadius: 8,
        offset: 36,
      })[0];

  const sides = useMemo(
    () => deriveSides(rel ?? ({ type: 'ONE_TO_MANY_NON_IDENTIFYING' } as Relationship)),
    [rel],
  );
  const isOneToMany = sides.childCardinality === 'many';
  const isIdentifying = sides.identifying;
  const parentSolid = !sides.parentOptional;   // 부모(좌) 절반 실선 여부
  const childSolid = !sides.childOptional;      // 자식(우) 절반 실선 여부
  const bothSolid = parentSolid && childSolid;
  const bothDashed = !parentSolid && !childSolid;
  const color = selected ? EDGE_SELECTED : EDGE_COLOR;
  const sw = selected ? 2.5 : 1.5;   // 선택 시 선 굵기 강조

  return (
    <>
      {/* Invisible wider hit area */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
      />
      {/* Visible edge — 좌/우 절반 독립 렌더 */}
      {bothSolid ? (
        /* 양쪽 필수: 단일 실선 (기존 SOLID 동작과 동일, dasharray 없음) */
        <path
          id={id}
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="butt"
        />
      ) : (
        <>
          {/* 베이스 점선 — 한쪽만 실선이면 '6 4', 양쪽 점선이면 '4 4' */}
          <path
            id={id}
            d={edgePath}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeDasharray={bothDashed ? '4 4' : '6 4'}
            strokeLinecap="butt"
          />
          {/* 부모(좌) 절반 실선 오버레이 — 전반 50% */}
          {parentSolid && (
            <path
              d={edgePath}
              fill="none"
              stroke={color}
              strokeWidth={sw}
              pathLength={100}
              strokeDasharray="50 50"
              strokeLinecap="butt"
            />
          )}
          {/* 자식(우) 절반 실선 오버레이 — 후반 50% */}
          {childSolid && (
            <path
              d={edgePath}
              fill="none"
              stroke={color}
              strokeWidth={sw}
              pathLength={100}
              strokeDasharray="0 50 50 0"
              strokeLinecap="butt"
            />
          )}
        </>
      )}

      {/* 상위(부모) 엔티티 쪽은 마커 없음 — 바커 표기법 */}

      {/* Target marker (many or one) */}
      {isOneToMany ? (
        <CrowsFoot
          x={tX} y={tY}
          pos={tPos}
          isIdentifying={isIdentifying}
          color={color}
        />
      ) : (
        <OneTargetMarker
          x={tX} y={tY}
          pos={tPos}
          isIdentifying={isIdentifying}
          color={color}
        />
      )}
    </>
  );
}

export default memo(RelationshipEdge);
