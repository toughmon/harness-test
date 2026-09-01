import { RelationshipType } from '../../types/erd';
import { useT, type TFunc } from '../../i18n';

// 선택 메뉴에 노출할 순서 — 라벨/설명은 사전(relType.* / relTypeDesc.*)이 소유한다.
// types/erd.ts의 RELATIONSHIP_LABELS는 MCP 도구 설명(LLM 대면)이 쓰는 정본이라 건드리지 않는다.
const TYPE_ORDER: RelationshipType[] = [
  'ONE_TO_MANY_IDENTIFYING',
  'ONE_TO_MANY_IDENTIFYING_SOLID',
  'ONE_TO_MANY_NON_IDENTIFYING',
  'ONE_TO_MANY_OPTIONAL',
  'ONE_TO_ONE_IDENTIFYING',
  'ONE_TO_ONE_IDENTIFYING_SOLID',
  'ONE_TO_ONE_NON_IDENTIFYING',
  'ONE_TO_ONE_OPTIONAL',
];

interface Props {
  onSelect: (type: RelationshipType) => void;
  onCancel: () => void;
  title?: string;
  current?: RelationshipType;   // 타입 변경 모드에서 현재 타입 강조
}

export default function RelTypeModal({ onSelect, onCancel, title, current }: Props) {
  const t = useT();
  const heading = title ?? t('relType.modalTitle');
  // 말이 안 되는 조합(1:1 실선+실선, 1:1 점선+점선)은 선택 메뉴에서 제외.
  // enum·렌더링·설명은 기존 저장 다이어그램 호환을 위해 그대로 유지한다.
  const HIDDEN_TYPES: RelationshipType[] = ['ONE_TO_ONE_IDENTIFYING_SOLID', 'ONE_TO_ONE_OPTIONAL'];
  const types = TYPE_ORDER.filter(type => !HIDDEN_TYPES.includes(type));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden min-w-72 max-w-[66vw] bg-surface-container border border-outline-variant"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-outline-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">mediation</span>
          <h3 className="text-sm font-semibold text-on-surface m-0">{heading}</h3>
        </div>
        <div className="p-2">
          {types.map(type => (
            <button
              key={type}
              className={`w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-variant rounded-lg transition-colors cursor-pointer group ${
                current === type ? 'bg-surface-variant border border-primary/40' : ''
              }`}
              onClick={() => onSelect(type)}
            >
              <div className="font-mono text-xs font-bold group-hover:text-primary transition-colors flex items-center gap-2">
                <span>{t(`relType.${type}`)}</span>
                {current === type && (
                  <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] uppercase tracking-wider font-sans">{t('relType.current')}</span>
                )}
                <RelLinePreview type={type} className="ml-auto shrink-0" />
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">
                {getTypeDesc(type, t)}
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 pb-3">
          <button
            className="w-full text-xs text-on-surface-variant hover:text-on-surface py-1.5 cursor-pointer transition-colors"
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// 관계선 미리보기 — RelationshipEdge.tsx의 실제 렌더링 규칙을 그대로 축소 반영
//   · 부모(왼쪽, source) → 자식(오른쪽, target/까마귀발) 방향
//   · 선: SOLID=전체 실선, OPTIONAL=전체 점선, 그 외=부모쪽 절반 점선 + 자식쪽 절반 실선(바커 표기)
//   · 1:M=까마귀발, 1:1=마커 없음(식별일 때만 막대)
//   · 식별 관계(상속)=자식쪽 식별자(uid) 막대 추가
function RelLinePreview({ type, className }: { type: RelationshipType; className?: string }) {
  const C = '#a8a7b8';      // 모달 배경 대비를 위해 EDGE_COLOR보다 약간 밝게
  const SW = 1.5;
  const W = 68, H = 22, midY = H / 2;
  const xParent = 2;        // 부모(왼쪽 엔티티) 끝
  const xToe = W - 3;       // 자식 엔티티 경계 — 까마귀발 발끝/타겟 지점
  const xBase = xToe - 12;  // 까마귀발이 모이는 base
  const xMid = (xParent + xToe) / 2;

  const isSolid = type === 'ONE_TO_MANY_IDENTIFYING_SOLID' || type === 'ONE_TO_ONE_IDENTIFYING_SOLID';
  const isOptional = type === 'ONE_TO_MANY_OPTIONAL' || type === 'ONE_TO_ONE_OPTIONAL';
  const isOneToMany = type.startsWith('ONE_TO_MANY');
  // RelationshipEdge.tsx와 동일 — 'NON_IDENTIFYING'도 '_IDENTIFYING'으로 끝나므로 명시 비교
  const isIdentifying =
    type === 'ONE_TO_MANY_IDENTIFYING' ||
    type === 'ONE_TO_MANY_IDENTIFYING_SOLID' ||
    type === 'ONE_TO_ONE_IDENTIFYING' ||
    type === 'ONE_TO_ONE_IDENTIFYING_SOLID';
  const prong = 5;          // 까마귀발/막대 세로 반높이

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden="true">
      {/* 관계선 */}
      {isSolid ? (
        <line x1={xParent} y1={midY} x2={xToe} y2={midY} stroke={C} strokeWidth={SW} />
      ) : isOptional ? (
        <line x1={xParent} y1={midY} x2={xToe} y2={midY} stroke={C} strokeWidth={SW} strokeDasharray="3 3" />
      ) : (
        <>
          <line x1={xParent} y1={midY} x2={xMid} y2={midY} stroke={C} strokeWidth={SW} strokeDasharray="5 3" />
          <line x1={xMid} y1={midY} x2={xToe} y2={midY} stroke={C} strokeWidth={SW} />
        </>
      )}

      {/* 자식쪽 타겟 마커 */}
      {isOneToMany ? (
        <>
          <line x1={xBase} y1={midY} x2={xToe} y2={midY - prong} stroke={C} strokeWidth={SW} />
          <line x1={xBase} y1={midY} x2={xToe} y2={midY} stroke={C} strokeWidth={SW} />
          <line x1={xBase} y1={midY} x2={xToe} y2={midY + prong} stroke={C} strokeWidth={SW} />
        </>
      ) : null}

      {/* 식별자(uid) 막대 — 식별 관계에서 자식쪽에 표시 */}
      {isIdentifying && (
        <line
          x1={isOneToMany ? xBase - 6 : xToe - 6}
          y1={midY - prong}
          x2={isOneToMany ? xBase - 6 : xToe - 6}
          y2={midY + prong}
          stroke={C}
          strokeWidth={SW}
        />
      )}
    </svg>
  );
}

function getTypeDesc(type: RelationshipType, t: TFunc): string {
  return t(`relTypeDesc.${type}`);
}
