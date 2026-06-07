import { useState } from 'react';
import { useERDStore } from '../../store/erdStore';
import { COLUMN_TYPES, Column, ColumnType, ENTITY_COLORS } from '../../types/erd';

// 디자인 시안의 Right Property Editor — 상시 표시되며 선택된 엔티티의 속성을 편집.
// 변경은 기존과 동일하게 실시간 반영 (시안의 Cancel/Apply는 해당 없음)
export default function EntityEditPanel() {
  const {
    entities, selectedEntityId, selectEntity,
    updateEntity, deleteEntity,
    addColumn, updateColumn, deleteColumn,
  } = useERDStore();

  const entity = entities.find(e => e.id === selectedEntityId);

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
                onClick={() => deleteEntity(entity.id)}
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
              <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Table Name</label>
              <input
                className="bg-input-bg border border-outline-variant rounded px-3 py-2 text-on-surface font-mono text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                type="text"
                value={entity.name}
                onChange={e => updateEntity(entity.id, { name: e.target.value })}
              />
            </div>

            {/* Table color */}
            <div className="flex flex-col gap-2 mt-1">
              <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Table Color</label>
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
              {entity.columns.map(col => (
                <ColumnRow
                  key={col.id}
                  col={col}
                  onUpdate={(updates) => updateColumn(entity.id, col.id, updates)}
                  onDelete={() => deleteColumn(entity.id, col.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

interface ColRowProps {
  col: Column;
  onUpdate: (updates: Partial<Column>) => void;
  onDelete: () => void;
}

function ColumnRow({ col, onUpdate, onDelete }: ColRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded p-3 flex flex-col gap-3 group transition-colors ${
        open
          ? 'bg-surface-variant border border-outline-variant'
          : 'bg-surface-container border border-transparent hover:border-outline-variant'
      }`}
    >
      {/* Row summary */}
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(v => !v)}>
        <div className={`flex items-center gap-2 w-full min-w-0 ${col.isPK || col.isFK ? '' : 'pl-6'}`}>
          {col.isPK && (
            <span className="material-symbols-outlined text-[16px] text-pk-color shrink-0" title="Primary Key">key</span>
          )}
          {!col.isPK && col.isFK && (
            <span className="material-symbols-outlined text-[16px] text-fk-color shrink-0" title="Foreign Key">link</span>
          )}
          <span className="flex-1 text-on-surface font-mono text-xs truncate">{col.name || '(unnamed)'}</span>
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
              value={col.name}
              onChange={e => onUpdate({ name: e.target.value })}
            />
          </div>

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
