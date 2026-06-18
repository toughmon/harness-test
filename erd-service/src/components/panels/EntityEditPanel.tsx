import { useState } from 'react';
import { useERDStore } from '../../store/erdStore';
import { COLUMN_TYPES, Column, ColumnType, ENTITY_COLORS, Subtype } from '../../types/erd';
import { confirmDialog } from '../../store/dialogStore';

// 디자인 시안의 Right Property Editor — 상시 표시되며 선택된 엔티티의 속성을 편집.
// 변경은 기존과 동일하게 실시간 반영 (시안의 Cancel/Apply는 해당 없음)
export default function EntityEditPanel() {
  const {
    entities, selectedEntityId, selectEntity,
    updateEntity, deleteEntity,
    addColumn, updateColumn, deleteColumn, moveColumn,
    addSubtype, updateSubsetMeta,
  } = useERDStore();

  const entity = entities.find(e => e.id === selectedEntityId);

  // 컬럼 드래그 순서 변경 상태
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const resetDrag = () => { setDragIdx(null); setOverIdx(null); };

  return (
    <aside className="w-[320px] shrink-0 bg-surface-container-low border-l border-outline-variant flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-12 px-4 border-b border-outline-variant flex items-center justify-between bg-surface-container shrink-0">
        <h3 className="text-[15px] font-semibold text-on-surface m-0">Properties</h3>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-surface-variant text-on-surface-variant font-mono text-[11px] max-w-32 truncate">
            {entity?.name ?? '—'}
          </span>
          {entity && (
            <>
              <button
                className="text-on-surface-variant hover:text-error transition-colors flex items-center cursor-pointer"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: '엔티티 삭제',
                    message: `"${entity.name}" 엔티티를 삭제할까요?\n연결된 관계선도 함께 삭제됩니다.`,
                    confirmText: '삭제',
                    danger: true,
                  });
                  if (ok) deleteEntity(entity.id);
                }}
                title="엔티티 삭제"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
              <button
                className="text-on-surface-variant hover:text-on-surface text-lg leading-none cursor-pointer"
                onClick={() => selectEntity(null)}
                title="선택 해제"
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>

      {!entity ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <span className="material-symbols-outlined text-[40px] text-outline-variant">touch_app</span>
          <p className="text-sm text-on-surface-variant m-0">엔티티를 선택하면<br />속성을 편집할 수 있습니다</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-6">
          {/* Table general info */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Table Name (물리명)</label>
              <input
                className="bg-input-bg border border-outline-variant rounded px-3 py-2 text-on-surface font-mono text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                type="text"
                value={entity.name}
                onChange={e => updateEntity(entity.id, { name: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Logical Name (논리명)</label>
              <input
                className="bg-input-bg border border-outline-variant rounded px-3 py-2 text-on-surface font-sans text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                type="text"
                placeholder="한글 명칭 (예: 사용자)"
                value={entity.logicalName ?? ''}
                onChange={e => updateEntity(entity.id, { logicalName: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Description / Notes</label>
              <textarea
                className="bg-input-bg border border-outline-variant rounded px-3 py-2 text-on-surface font-sans text-xs h-20 resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all custom-scrollbar"
                placeholder="테이블 설명을 입력하세요..."
                value={entity.description ?? ''}
                onChange={e => updateEntity(entity.id, { description: e.target.value })}
              />
            </div>

            {/* Entity color */}
            <div className="flex flex-col gap-2 mt-1">
              <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Entity Color</label>
              <div className="grid grid-cols-6 gap-2">
                {ENTITY_COLORS.map(c => (
                  <button
                    key={c}
                    className={`w-6 h-6 rounded-full cursor-pointer hover:scale-110 transition-transform ${
                      entity.color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-low' : ''
                    }`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => updateEntity(entity.id, { color: c })}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="w-full h-px bg-outline-variant/50" />

          {/* Columns */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Columns</label>
              <button
                className="text-primary hover:text-inverse-primary text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
                onClick={() => addColumn(entity.id)}
              >
                <span className="material-symbols-outlined text-[14px]">add</span> Add
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {entity.columns.map((col, idx) => (
                <ColumnRow
                  key={col.id}
                  col={col}
                  onUpdate={(updates) => updateColumn(entity.id, col.id, updates)}
                  onDelete={() => deleteColumn(entity.id, col.id)}
                  dragging={dragIdx === idx}
                  dragOver={overIdx === idx && dragIdx !== null && dragIdx !== idx}
                  onDragStart={() => setDragIdx(idx)}
                  onDragEnd={resetDrag}
                  onDragOver={() => { if (dragIdx !== null) setOverIdx(idx); }}
                  onDrop={() => {
                    if (dragIdx !== null && dragIdx !== idx) moveColumn(entity.id, dragIdx, idx);
                    resetDrag();
                  }}
                />
              ))}
            </div>
          </div>

          <div className="w-full h-px bg-outline-variant/50" />

          {/* SubSet — 배타적 서브타입 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">SubSet (서브타입)</label>
              <button
                className="text-primary hover:text-inverse-primary text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
                onClick={() => addSubtype(entity.id)}
                data-testid="add-subtype"
              >
                <span className="material-symbols-outlined text-[14px]">add</span> Add Subtype
              </button>
            </div>

            {(entity.subtypes?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-outline italic m-0">
                서브타입을 추가하면 슈퍼타입 안에 배타적 하위 엔티티 그룹이 생성됩니다.
              </p>
            ) : (
              <>
                {/* 그룹 설정: 이름 + 배타/완전 */}
                <div className="flex flex-col gap-2">
                  <input
                    className="bg-input-bg border border-outline-variant rounded px-3 py-2 text-on-surface font-mono text-xs focus:outline-none focus:border-primary"
                    type="text"
                    placeholder="SubSet 이름 (구분자)"
                    value={entity.subsetName ?? 'SubSet'}
                    onChange={e => updateSubsetMeta(entity.id, { subsetName: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer bg-input-bg border border-outline-variant rounded px-2 py-1.5 flex-1 justify-center">
                      <input
                        type="checkbox"
                        className="rounded border-outline-variant accent-[#8083ff] w-3.5 h-3.5 cursor-pointer"
                        checked={entity.subtypeExclusive ?? true}
                        onChange={e => updateSubsetMeta(entity.id, { subtypeExclusive: e.target.checked })}
                      />
                      <span className="font-mono text-[11px] text-on-surface-variant">배타 (Exclusive)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer bg-input-bg border border-outline-variant rounded px-2 py-1.5 flex-1 justify-center">
                      <input
                        type="checkbox"
                        className="rounded border-outline-variant accent-[#8083ff] w-3.5 h-3.5 cursor-pointer"
                        checked={entity.subtypeComplete ?? false}
                        onChange={e => updateSubsetMeta(entity.id, { subtypeComplete: e.target.checked })}
                      />
                      <span className="font-mono text-[11px] text-on-surface-variant">완전 (Complete)</span>
                    </label>
                  </div>
                </div>

                {/* 서브타입 목록 */}
                <div className="flex flex-col gap-2">
                  {entity.subtypes!.map(st => (
                    <SubtypeCard key={st.id} entityId={entity.id} subtype={st} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

// 서브타입 카드 — 이름·논리명 편집 + 고유 속성(컬럼) 관리 + 삭제
function SubtypeCard({ entityId, subtype }: { entityId: string; subtype: Subtype }) {
  const { updateSubtype, removeSubtype, addSubtypeColumn, updateSubtypeColumn, deleteSubtypeColumn } = useERDStore();
  return (
    <div className="rounded p-2.5 flex flex-col gap-2 bg-surface-container border border-outline-variant" data-testid="subtype-card">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">category</span>
        <input
          className="flex-1 min-w-0 bg-input-bg border border-outline-variant rounded px-2 py-1 text-on-surface font-mono text-[11px] focus:outline-none focus:border-primary"
          type="text"
          placeholder="물리명"
          value={subtype.name}
          onChange={e => updateSubtype(entityId, subtype.id, { name: e.target.value })}
        />
        <button
          className="text-outline-variant hover:text-error shrink-0 flex items-center cursor-pointer"
          title="서브타입 삭제"
          onClick={() => removeSubtype(entityId, subtype.id)}
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
      <input
        className="w-full bg-input-bg border border-outline-variant rounded px-2 py-1 text-on-surface font-sans text-[11px] focus:outline-none focus:border-primary"
        type="text"
        placeholder="논리명 (한글)"
        value={subtype.logicalName ?? ''}
        onChange={e => updateSubtype(entityId, subtype.id, { logicalName: e.target.value })}
      />

      <div className="flex flex-col gap-1 pl-1">
        {subtype.columns.map(col => (
          <SubtypeColumnRow
            key={col.id}
            col={col}
            onUpdate={u => updateSubtypeColumn(entityId, subtype.id, col.id, u)}
            onDelete={() => deleteSubtypeColumn(entityId, subtype.id, col.id)}
          />
        ))}
        <button
          className="text-primary hover:text-inverse-primary text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer self-start mt-0.5"
          onClick={() => addSubtypeColumn(entityId, subtype.id)}
          data-testid="add-subtype-column"
        >
          <span className="material-symbols-outlined text-[12px]">add</span> 속성 추가
        </button>
      </div>
    </div>
  );
}

// 서브타입 고유 속성 1행 — 펼치면 타입/제약 편집
function SubtypeColumnRow({ col, onUpdate, onDelete }: { col: Column; onUpdate: (u: Partial<Column>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded bg-surface-variant/40 border border-transparent hover:border-outline-variant">
      <div className="flex items-center gap-1.5 px-2 py-1 cursor-pointer" onClick={() => setOpen(v => !v)}>
        {col.isFK && <span className="material-symbols-outlined text-[13px] text-fk-color shrink-0" title="Foreign Key">link</span>}
        <span className="flex-1 font-mono text-[11px] text-on-surface truncate">{col.name || '(unnamed)'}</span>
        <span className="font-mono text-[10px] text-on-surface-variant shrink-0">{col.type}{col.size ? `(${col.size})` : ''}</span>
        <button
          className="text-outline-variant hover:text-error shrink-0 flex items-center cursor-pointer"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="속성 삭제"
        >
          <span className="material-symbols-outlined text-[14px]">delete</span>
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 px-2 pb-2 pt-1 border-t border-outline-variant/40">
          <input
            className="w-full bg-input-bg border border-outline-variant rounded px-2 py-1 text-on-surface font-mono text-[11px] focus:outline-none focus:border-primary"
            type="text" placeholder="물리명" value={col.name}
            onChange={e => onUpdate({ name: e.target.value })}
          />
          <input
            className="w-full bg-input-bg border border-outline-variant rounded px-2 py-1 text-on-surface font-sans text-[11px] focus:outline-none focus:border-primary"
            type="text" placeholder="논리명 (한글)" value={col.logicalName ?? ''}
            onChange={e => onUpdate({ logicalName: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <select
              className="flex-1 min-w-0 bg-input-bg border border-outline-variant rounded px-2 py-1 text-on-surface font-mono text-[11px] focus:outline-none focus:border-primary appearance-none cursor-pointer"
              value={col.type}
              onChange={e => onUpdate({ type: e.target.value as ColumnType })}
            >
              {COLUMN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              className="w-14 bg-input-bg border border-outline-variant rounded px-2 py-1 text-on-surface font-mono text-[11px] focus:outline-none focus:border-primary"
              value={col.size} placeholder="size"
              onChange={e => onUpdate({ size: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer bg-input-bg border border-outline-variant rounded px-2 py-1 flex-1 justify-center">
              <input type="checkbox" className="rounded border-outline-variant accent-[#8083ff] w-3.5 h-3.5 cursor-pointer" checked={col.isNN} onChange={e => onUpdate({ isNN: e.target.checked })} />
              <span className="font-mono text-[10px] text-on-surface-variant">NOT NULL</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer bg-input-bg border border-outline-variant rounded px-2 py-1 flex-1 justify-center">
              <input type="checkbox" className="rounded border-outline-variant accent-[#8083ff] w-3.5 h-3.5 cursor-pointer" checked={col.isFK} onChange={e => onUpdate({ isFK: e.target.checked })} />
              <span className="font-mono text-[10px] text-on-surface-variant">FK</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

interface ColRowProps {
  col: Column;
  onUpdate: (updates: Partial<Column>) => void;
  onDelete: () => void;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}

function ColumnRow({ col, onUpdate, onDelete, dragging, dragOver, onDragStart, onDragEnd, onDragOver, onDrop }: ColRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded p-3 flex flex-col gap-3 group transition-colors ${
        open
          ? 'bg-surface-variant border border-outline-variant'
          : 'bg-surface-container border border-transparent hover:border-outline-variant'
      } ${dragging ? 'opacity-40' : ''} ${dragOver ? 'ring-1 ring-primary border-primary' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
    >
      {/* Row summary */}
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(v => !v)}>
        {/* 드래그 핸들 — 순서 변경 */}
        <span
          className="material-symbols-outlined text-[16px] text-outline-variant hover:text-on-surface cursor-grab active:cursor-grabbing shrink-0 mr-1 opacity-40 group-hover:opacity-100 transition-opacity"
          title="드래그하여 순서 변경"
          draggable
          data-testid={`col-drag-${col.name}`}
          onClick={e => e.stopPropagation()}
          onDragStart={e => {
            e.dataTransfer.setData('text/plain', col.id); // Firefox 호환
            e.dataTransfer.effectAllowed = 'move';
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          drag_indicator
        </span>
        <div className={`flex items-center gap-2 w-full min-w-0 ${col.isPK || col.isFK ? '' : 'pl-6'}`}>
          {col.isPK && (
            <span className="material-symbols-outlined text-[16px] text-pk-color shrink-0" title="Primary Key">key</span>
          )}
          {!col.isPK && col.isFK && (
            <span className="material-symbols-outlined text-[16px] text-fk-color shrink-0" title="Foreign Key">link</span>
          )}
          <span className="flex-1 flex items-baseline gap-1.5 min-w-0">
            <span className="text-on-surface font-mono text-xs truncate">{col.name || '(unnamed)'}</span>
            {col.logicalName && (
              <span className="text-on-surface-variant font-sans text-[10px] truncate shrink-0 max-w-20">{col.logicalName}</span>
            )}
          </span>
          <span className="text-on-surface-variant font-mono text-[11px] shrink-0">
            {col.type}{col.size ? `(${col.size})` : ''}
          </span>
        </div>
        <button
          className="text-outline-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex items-center cursor-pointer shrink-0"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="컬럼 삭제"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>

      {/* Expanded editor */}
      {open && (
        <div className="flex flex-col gap-2 border-t border-outline-variant/50 pt-3">
          {/* Name */}
          <div className="flex items-center gap-2 w-full">
            <button
              className={`shrink-0 flex items-center cursor-pointer transition-opacity ${col.isPK ? 'text-pk-color' : 'text-outline-variant hover:text-pk-color'}`}
              title="Toggle Primary Key"
              onClick={() => onUpdate({ isPK: !col.isPK })}
            >
              <span className="material-symbols-outlined text-[18px]">key</span>
            </button>
            <button
              className={`shrink-0 flex items-center cursor-pointer transition-opacity ${col.isFK ? 'text-fk-color' : 'text-outline-variant hover:text-fk-color'}`}
              title="Toggle Foreign Key"
              onClick={() => onUpdate({ isFK: !col.isFK })}
            >
              <span className="material-symbols-outlined text-[18px]">link</span>
            </button>
            <input
              className="flex-1 min-w-0 bg-input-bg border border-outline-variant rounded px-2 py-1.5 text-on-surface font-mono text-xs focus:outline-none focus:border-primary"
              type="text"
              placeholder="물리명"
              value={col.name}
              onChange={e => onUpdate({ name: e.target.value })}
            />
          </div>

          {/* 논리명 (한글 명칭) */}
          <input
            className="w-full bg-input-bg border border-outline-variant rounded px-2 py-1.5 text-on-surface font-sans text-xs focus:outline-none focus:border-primary"
            type="text"
            placeholder="논리명 (한글 명칭)"
            value={col.logicalName ?? ''}
            onChange={e => onUpdate({ logicalName: e.target.value })}
          />

          {/* Type + Size */}
          <div className="flex items-center gap-2 w-full">
            <select
              className="flex-1 min-w-0 bg-input-bg border border-outline-variant rounded px-2 py-1.5 text-on-surface font-mono text-xs focus:outline-none focus:border-primary appearance-none cursor-pointer"
              value={col.type}
              onChange={e => onUpdate({ type: e.target.value as ColumnType })}
            >
              {COLUMN_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              className="w-16 bg-input-bg border border-outline-variant rounded px-2 py-1.5 text-on-surface font-mono text-xs focus:outline-none focus:border-primary"
              value={col.size}
              placeholder="size"
              onChange={e => onUpdate({ size: e.target.value })}
            />
          </div>

          {/* Constraints */}
          <div className="flex items-center gap-2 w-full">
            <label className="flex items-center gap-1.5 cursor-pointer bg-input-bg border border-outline-variant rounded px-2 py-1.5 flex-1 justify-center">
              <input
                type="checkbox"
                className="rounded border-outline-variant accent-[#8083ff] w-3.5 h-3.5 cursor-pointer"
                checked={col.isNN}
                onChange={e => onUpdate({ isNN: e.target.checked })}
              />
              <span className="font-mono text-[11px] text-on-surface-variant">NOT NULL</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer bg-input-bg border border-outline-variant rounded px-2 py-1.5 flex-1 justify-center">
              <input
                type="checkbox"
                className="rounded border-outline-variant accent-[#8083ff] w-3.5 h-3.5 cursor-pointer"
                checked={col.isUnique}
                onChange={e => onUpdate({ isUnique: e.target.checked })}
              />
              <span className="font-mono text-[11px] text-on-surface-variant">UNIQUE</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
