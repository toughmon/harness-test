import { memo, useMemo } from 'react';
import {
  EdgeProps,
  getSmoothStepPath,
  EdgeLabelRenderer,
  Position,
  useNodes,
} from '@xyflow/react';
import { Relationship, RelationshipType } from '../../types/erd';
import { useERDStore } from '../../store/erdStore';
import { computeEdgeEndpoints, Rect } from '../../utils/edgeConnection';

const EDGE_COLOR = '#64748b';
const M = 14;  // crow's foot size
const B = 6;   // bar offset from path end

// 바커 표기법 선 스타일:
// - 반점선+반실선: 부모(source) 쪽 절반 = 점선(선택), 자식(target/까마귀발) 쪽 절반 = 실선(필수)
// - 전체 점선: 선택적 관계 (ONE_TO_MANY_OPTIONAL)
function isHalfDashed(type: RelationshipType): boolean {
  return type !== 'ONE_TO_MANY_OPTIONAL';
}

// CrowsFoot markers at target end, extending away from entity
function CrowsFoot({ x, y, pos, isIdentifying }: {
  x: number; y: number; pos: Position; isIdentifying: boolean
}) {
  const c = EDGE_COLOR;
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
function OneTargetMarker({ x, y, pos, isIdentifying }: {
  x: number; y: number; pos: Position; isIdentifying: boolean
}) {
  const c = EDGE_COLOR;
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
  const { deleteRelationship, relationships } = useERDStore();

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

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sX, sourceY: sY, sourcePosition: sPos,
    targetX: tX, targetY: tY, targetPosition: tPos,
    borderRadius: 8,
    offset: 36, // 핸들 앞 직선 구간 확보 — 까마귀발/uid bar가 꺾임과 겹치지 않도록
  });

  const type = rel?.type ?? 'ONE_TO_MANY_NON_IDENTIFYING';
  const halfDashed = isHalfDashed(type);
  const isOneToMany =
    type === 'ONE_TO_MANY_IDENTIFYING' ||
    type === 'ONE_TO_MANY_NON_IDENTIFYING' ||
    type === 'ONE_TO_MANY_OPTIONAL';
  const isIdentifying =
    type === 'ONE_TO_MANY_IDENTIFYING' || type === 'ONE_TO_ONE_IDENTIFYING';
  const color = selected ? '#60a5fa' : EDGE_COLOR;

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
      {/* Visible edge — layer 1: 전체 점선 (부모 쪽 절반에서 보임) */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={halfDashed ? '6 4' : '4 4'}
        strokeLinecap="butt"
      />
      {/* layer 2: 자식(target) 쪽 후반 50%만 실선으로 덮음 (바커: 자식 쪽 필수) */}
      {halfDashed && (
        <path
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          pathLength={100}
          strokeDasharray="0 50 50 0"
          strokeLinecap="butt"
        />
      )}

      {/* 상위(부모) 엔티티 쪽은 마커 없음 — 바커 표기법 */}

      {/* Target marker (many or one) */}
      {isOneToMany ? (
        <CrowsFoot
          x={tX} y={tY}
          pos={tPos}
          isIdentifying={isIdentifying}
        />
      ) : (
        <OneTargetMarker
          x={tX} y={tY}
          pos={tPos}
          isIdentifying={isIdentifying}
        />
      )}

      {/* Delete button on select */}
      {selected && (
        <EdgeLabelRenderer>
          <button
            className="absolute z-50 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center hover:bg-red-500"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            onClick={() => deleteRelationship(id)}
            title="관계 삭제"
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(RelationshipEdge);
