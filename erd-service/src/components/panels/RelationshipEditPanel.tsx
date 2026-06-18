import { useERDStore } from '../../store/erdStore';
import { confirmDialog } from '../../store/dialogStore';
import { deriveSides, labelForSides, type RelationshipSides } from '../../core/relationshipSides';

// 우측 Properties 패널의 관계선 편집 버전 — 선의 좌(부모)/우(자식) 절반을 각각 독립 설정한다.
// 엣지 선택(selectedEdgeId) 시 App이 EntityEditPanel 대신 이 패널을 렌더한다.
export default function RelationshipEditPanel() {
  const {
    relationships, entities, selectedEdgeId,
    selectEdge, updateRelationshipSides, deleteRelationship,
  } = useERDStore();

  const rel = relationships.find(r => r.id === selectedEdgeId);
  const sides = rel ? deriveSides(rel) : null;
  const parent = rel ? entities.find(e => e.id === rel.sourceId) : undefined;
  const child = rel ? entities.find(e => e.id === rel.targetId) : undefined;

  const set = (partial: Partial<RelationshipSides>) => {
    if (rel) updateRelationshipSides(rel.id, partial);
  };

  return (
    <aside
      className="w-[320px] shrink-0 bg-surface-container-low border-l border-outline-variant flex flex-col overflow-hidden"
      data-testid="rel-panel"
    >
      {/* Header */}
      <div className="h-12 px-4 border-b border-outline-variant flex items-center justify-between bg-surface-container shrink-0">
        <h3 className="text-[15px] font-semibold text-on-surface m-0">관계 속성</h3>
        <button
          className="text-on-surface-variant hover:text-on-surface text-lg leading-none cursor-pointer"
          onClick={() => selectEdge(null)}
          title="선택 해제"
        >
          ×
        </button>
      </div>

      {!rel || !sides ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <span className="material-symbols-outlined text-[40px] text-outline-variant">touch_app</span>
          <p className="text-sm text-on-surface-variant m-0">관계선을 선택하면<br />좌/우 속성을 편집할 수 있습니다</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-6">
          {/* 부모 → 자식 + 미리보기 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2 py-0.5 rounded bg-surface-variant text-on-surface-variant truncate max-w-[110px]" title={parent?.name}>
                {parent?.name ?? '?'}
              </span>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
              <span className="px-2 py-0.5 rounded bg-surface-variant text-on-surface-variant truncate max-w-[110px]" title={child?.name}>
                {child?.name ?? '?'}
              </span>
            </div>
            <div className="rounded border border-outline-variant bg-input-bg p-3 flex items-center justify-center" data-testid="rel-preview">
              <RelMiniPreview sides={sides} />
            </div>
            <p className="text-[11px] text-on-surface-variant font-mono m-0 text-center" data-testid="rel-summary">
              {labelForSides(sides)}
            </p>
          </div>

          <div className="w-full h-px bg-outline-variant/50" />

          {/* 부모 쪽 절반 */}
          <div className="flex flex-col gap-3">
            <label className="font-mono text-[11px] text-primary tracking-wider flex items-baseline gap-1.5">
              부모 쪽 <span className="text-on-surface-variant normal-case truncate">· {parent?.name ?? '?'}</span>
            </label>
            <SegToggle
              label="참여 (선 스타일)"
              value={sides.parentOptional ? 'optional' : 'mandatory'}
              options={[
                { value: 'mandatory', label: '실선 · 필수', testid: 'rel-parent-mandatory' },
                { value: 'optional', label: '점선 · 선택', testid: 'rel-parent-optional' },
              ]}
              onChange={v => set({ parentOptional: v === 'optional' })}
            />
          </div>

          <div className="w-full h-px bg-outline-variant/50" />

          {/* 자식 쪽 절반 */}
          <div className="flex flex-col gap-3">
            <label className="font-mono text-[11px] text-primary tracking-wider flex items-baseline gap-1.5">
              자식 쪽 <span className="text-on-surface-variant normal-case truncate">· {child?.name ?? '?'}</span>
            </label>
            <SegToggle
              label="참여 (선 스타일)"
              value={sides.childOptional ? 'optional' : 'mandatory'}
              options={[
                { value: 'mandatory', label: '실선 · 필수', testid: 'rel-child-mandatory' },
                { value: 'optional', label: '점선 · 선택', testid: 'rel-child-optional' },
              ]}
              onChange={v => set({ childOptional: v === 'optional' })}
            />
            <SegToggle
              label="카디널리티"
              value={sides.childCardinality}
              options={[
                { value: 'one', label: '1 (단일)', testid: 'rel-card-one' },
                { value: 'many', label: '다 (까마귀발)', testid: 'rel-card-many' },
              ]}
              onChange={v => set({ childCardinality: v })}
            />
            <label
              className={`flex items-center gap-2 bg-input-bg border border-outline-variant rounded px-3 py-2 ${
                sides.childOptional ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
              data-testid="rel-identifying"
            >
              <input
                type="checkbox"
                className="rounded border-outline-variant accent-[#8083ff] w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed"
                checked={sides.identifying}
                disabled={sides.childOptional}
                onChange={e => set({ identifying: e.target.checked })}
              />
              <span className="font-mono text-[11px] text-on-surface-variant">식별 관계 (FK를 자식 PK에 포함)</span>
            </label>
            <p className="text-[10px] text-outline italic m-0">
              {sides.childOptional
                ? '자식이 선택 참여(점선)면 식별 관계가 될 수 없습니다 — FK는 NULL 허용 일반 컬럼.'
                : sides.identifying
                ? '자식 FK가 PK에 포함됩니다 (식별 막대 표시).'
                : '자식 FK는 일반 컬럼(NOT NULL)입니다.'}
            </p>
          </div>

          <div className="w-full h-px bg-outline-variant/50" />

          {/* 삭제 */}
          <button
            className="flex items-center justify-center gap-1.5 rounded px-3 py-2 text-[12px] font-mono text-error border border-error/40 hover:bg-error-container/30 transition-colors cursor-pointer"
            data-testid="rel-delete"
            onClick={async () => {
              const ok = await confirmDialog({
                title: '관계 삭제',
                message: `"${parent?.name ?? '?'} → ${child?.name ?? '?'}" 관계를 삭제할까요?\n자동 생성된 FK 컬럼도 함께 제거됩니다.`,
                confirmText: '삭제',
                danger: true,
              });
              if (ok) deleteRelationship(rel.id);
            }}
          >
            <span className="material-symbols-outlined text-[16px]">delete</span> 관계 삭제
          </button>
        </div>
      )}
    </aside>
  );
}

// 두 옵션 세그먼트 토글
function SegToggle<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; testid?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-1 bg-input-bg border border-outline-variant rounded p-1">
        {options.map(opt => (
          <button
            key={opt.value}
            data-testid={opt.testid}
            aria-pressed={value === opt.value}
            className={`flex-1 px-2 py-1.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
              value === opt.value
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-variant'
            }`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 관계선 좌/우 절반 미리보기 — RelationshipEdge 렌더 규칙을 가로선으로 축약
function RelMiniPreview({ sides }: { sides: RelationshipSides }) {
  const C = '#c7c4d7';
  const SW = 1.5;
  const W = 200, H = 26, midY = H / 2;
  const xLeft = 6, xMid = W / 2, xRight = W - 22;
  const xToe = W - 6;          // 까마귀발/단일 마커가 닿는 자식 엔티티 경계
  const prong = 6;

  const parentSolid = !sides.parentOptional;
  const childSolid = !sides.childOptional;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="관계선 미리보기">
      {/* 부모(좌) 절반 */}
      <line
        x1={xLeft} y1={midY} x2={xMid} y2={midY}
        stroke={C} strokeWidth={SW}
        strokeDasharray={parentSolid ? undefined : '4 3'}
      />
      {/* 자식(우) 절반 — 까마귀발 베이스(xRight)까지 */}
      <line
        x1={xMid} y1={midY} x2={xRight} y2={midY}
        stroke={C} strokeWidth={SW}
        strokeDasharray={childSolid ? undefined : '4 3'}
      />
      {/* 자식 카디널리티 마커 */}
      {sides.childCardinality === 'many' ? (
        <>
          <line x1={xRight} y1={midY} x2={xToe} y2={midY - prong} stroke={C} strokeWidth={SW} />
          <line x1={xRight} y1={midY} x2={xToe} y2={midY} stroke={C} strokeWidth={SW} />
          <line x1={xRight} y1={midY} x2={xToe} y2={midY + prong} stroke={C} strokeWidth={SW} />
        </>
      ) : (
        <line x1={xRight} y1={midY} x2={xToe} y2={midY} stroke={C} strokeWidth={SW} />
      )}
      {/* 식별 막대 */}
      {sides.identifying && (
        <line x1={xRight - 6} y1={midY - prong} x2={xRight - 6} y2={midY + prong} stroke={C} strokeWidth={SW} />
      )}
    </svg>
  );
}
