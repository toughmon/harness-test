import { useERDStore } from '../../store/erdStore';
import { deriveSides, type RelationshipSides } from '../../core/relationshipSides';
import { labelForSides } from '../../i18n/labels';
import { useT } from '../../i18n';
import EditorModal from '../common/EditorModal';
import type { Subtype } from '../../types/erd';
import { confirmDeleteRelationship } from '../../store/deleteActions';

// 관계선 편집 모달 — ✎ 아이콘 클릭 / 우클릭 "편집"으로 연다 (editorOpen === 'relationship').
// 선의 좌(부모)/우(자식) 절반을 각각 독립 설정한다.
export default function RelationshipEditPanel() {
  const {
    relationships, entities, selectedEdgeId, editorOpen,
    closeEditor, updateRelationshipSides, updateRelationshipSubtypeScope,
    updateRelationshipMidOffset,
  } = useERDStore();

  const t = useT();
  const rel = relationships.find(r => r.id === selectedEdgeId);
  const sides = rel ? deriveSides(rel) : null;
  const parent = rel ? entities.find(e => e.id === rel.sourceId) : undefined;
  const child = rel ? entities.find(e => e.id === rel.targetId) : undefined;
  const parentSubtype = parent?.subtypes?.find(st => st.id === rel?.sourceSubtypeId);
  const childSubtype = child?.subtypes?.find(st => st.id === rel?.targetSubtypeId);

  if (editorOpen !== 'relationship' || !rel || !sides) return null;

  const set = (partial: Partial<RelationshipSides>) => {
    updateRelationshipSides(rel.id, partial);
  };

  return (
    <EditorModal
      title={t('relEdit.title')}
      icon="mediation"
      onClose={closeEditor}
      testId="rel-panel"
    >
      <div className="p-4 flex flex-col gap-6" data-testid="rel-panel-content">
        {/* 부모 → 자식 + 미리보기 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span
              className="px-2 py-0.5 rounded bg-surface-variant text-on-surface-variant truncate max-w-[130px]"
              title={parent?.name}
              data-testid="rel-parent-label"
            >
              {parent?.name ?? '?'}{parentSubtype ? ` · ${parentSubtype.name}` : ''}
            </span>
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
            <span
              className="px-2 py-0.5 rounded bg-surface-variant text-on-surface-variant truncate max-w-[130px]"
              title={child?.name}
              data-testid="rel-child-label"
            >
              {child?.name ?? '?'}{childSubtype ? ` · ${childSubtype.name}` : ''}
            </span>
          </div>
          <div className="rounded border border-outline-variant bg-input-bg p-3 flex items-center justify-center" data-testid="rel-preview">
            <RelMiniPreview sides={sides} />
          </div>
          <p className="text-[11px] text-on-surface-variant font-mono m-0 text-center" data-testid="rel-summary">
            {labelForSides(sides, t)}
          </p>
        </div>

        <div className="w-full h-px bg-outline-variant/50" />

        {/* 부모 쪽 절반 */}
        <div className="flex flex-col gap-3">
          <label className="font-mono text-[11px] text-primary tracking-wider flex items-baseline gap-1.5">
            {t('relEdit.parentSide')} <span className="text-on-surface-variant normal-case truncate">· {parent?.name ?? '?'}</span>
          </label>
          {!!parent?.subtypes?.length && (
            <SubtypeScopeSelect
              testid="rel-parent-subtype"
              subtypes={parent.subtypes}
              value={rel.sourceSubtypeId ?? ''}
              onChange={v => updateRelationshipSubtypeScope(rel.id, 'source', v || null)}
            />
          )}
          <SegToggle
            label={t('relEdit.participation')}
            value={sides.parentOptional ? 'optional' : 'mandatory'}
            options={[
              { value: 'mandatory', label: t('relEdit.mandatory'), testid: 'rel-parent-mandatory' },
              { value: 'optional', label: t('relEdit.optional'), testid: 'rel-parent-optional' },
            ]}
            onChange={v => set({ parentOptional: v === 'optional' })}
          />
        </div>

        <div className="w-full h-px bg-outline-variant/50" />

        {/* 자식 쪽 절반 */}
        <div className="flex flex-col gap-3">
          <label className="font-mono text-[11px] text-primary tracking-wider flex items-baseline gap-1.5">
            {t('relEdit.childSide')} <span className="text-on-surface-variant normal-case truncate">· {child?.name ?? '?'}</span>
          </label>
          {!!child?.subtypes?.length && (
            <SubtypeScopeSelect
              testid="rel-child-subtype"
              subtypes={child.subtypes}
              value={rel.targetSubtypeId ?? ''}
              onChange={v => updateRelationshipSubtypeScope(rel.id, 'target', v || null)}
            />
          )}
          <SegToggle
            label={t('relEdit.participation')}
            value={sides.childOptional ? 'optional' : 'mandatory'}
            options={[
              { value: 'mandatory', label: t('relEdit.mandatory'), testid: 'rel-child-mandatory' },
              { value: 'optional', label: t('relEdit.optional'), testid: 'rel-child-optional' },
            ]}
            onChange={v => set({ childOptional: v === 'optional' })}
          />
          <SegToggle
            label={t('relEdit.cardinality')}
            value={sides.childCardinality}
            options={[
              { value: 'one', label: t('relEdit.cardOne'), testid: 'rel-card-one' },
              { value: 'many', label: t('relEdit.cardMany'), testid: 'rel-card-many' },
            ]}
            onChange={v => set({ childCardinality: v })}
          />
          <label
            className={`flex items-center gap-2 bg-input-bg border border-outline-variant rounded px-3 py-2 ${
              sides.childOptional || rel.targetSubtypeId ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            data-testid="rel-identifying"
          >
            <input
              type="checkbox"
              className="rounded border-outline-variant accent-[#8083ff] w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed"
              checked={sides.identifying}
              disabled={sides.childOptional || !!rel.targetSubtypeId}
              onChange={e => set({ identifying: e.target.checked })}
            />
            <span className="font-mono text-[11px] text-on-surface-variant">{t('relEdit.identifying')}</span>
          </label>
          <p className="text-[10px] text-outline italic m-0">
            {rel.targetSubtypeId
              ? t('relEdit.identHintSubtype')
              : sides.childOptional
              ? t('relEdit.identHintOptional')
              : sides.identifying
              ? t('relEdit.identHintOn')
              : t('relEdit.identHintOff')}
          </p>
        </div>

        {/* 선 경로 — 선을 드래그해 우회시켜 둔 경우에만 노출 */}
        {rel.midOffset && (
          <>
            <div className="w-full h-px bg-outline-variant/50" />
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono text-on-surface-variant">{t('relEdit.linePath')}</span>
              <button
                className="flex items-center justify-center gap-1.5 rounded px-3 py-2 text-[12px] font-mono text-on-surface-variant border border-outline-variant hover:bg-surface-variant transition-colors cursor-pointer"
                data-testid="rel-reset-bend"
                onClick={() => updateRelationshipMidOffset(rel.id, null)}
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span> {t('relEdit.clearBend')}
              </button>
              <p className="text-[10px] text-outline italic m-0">
                {t('relEdit.bendHint')}
              </p>
            </div>
          </>
        )}

        <div className="w-full h-px bg-outline-variant/50" />

        {/* 삭제 */}
        <button
          className="flex items-center justify-center gap-1.5 rounded px-3 py-2 text-[12px] font-mono text-error border border-error/40 hover:bg-error-container/30 transition-colors cursor-pointer"
          data-testid="rel-delete"
          onClick={() => { void confirmDeleteRelationship(rel.id); }}
        >
          <span className="material-symbols-outlined text-[16px]">delete</span> {t('delete.relationship.title')}
        </button>
      </div>
    </EditorModal>
  );
}

// 이 관계가 어느 서브타입 전용인지 지정하는 드롭다운 ("(엔티티 전체)" + 서브타입 목록)
function SubtypeScopeSelect({
  testid, subtypes, value, onChange,
}: {
  testid: string;
  subtypes: Subtype[];
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">{t('relEdit.scopeLabel')}</label>
      <select
        data-testid={testid}
        className="bg-input-bg border border-outline-variant rounded px-2 py-1.5 text-on-surface font-mono text-[11px] focus:outline-none focus:border-primary appearance-none cursor-pointer"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{t('relEdit.scopeAll')}</option>
        {subtypes.map(st => (
          <option key={st.id} value={st.id}>{st.name}{st.logicalName ? ` · ${st.logicalName}` : ''}</option>
        ))}
      </select>
    </div>
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
  const t = useT();
  const C = '#c7c4d7';
  const SW = 1.5;
  const W = 200, H = 26, midY = H / 2;
  const xLeft = 6, xMid = W / 2, xRight = W - 22;
  const xToe = W - 6;          // 까마귀발/단일 마커가 닿는 자식 엔티티 경계
  const prong = 6;

  const parentSolid = !sides.parentOptional;
  const childSolid = !sides.childOptional;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('relEdit.previewAlt')}>
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
