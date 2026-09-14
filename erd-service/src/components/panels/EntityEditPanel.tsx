import { useState } from 'react';
import { useERDStore } from '../../store/erdStore';
import { COLUMN_TYPES, Column, ColumnType, ENTITY_COLORS } from '../../types/erd';
import EditorModal from '../common/EditorModal';
import { confirmDeleteEntity } from '../../store/deleteActions';
import { useT } from '../../i18n';

// 엔티티 속성 편집 모달 — info 아이콘 클릭 / 우클릭 "편집"으로 연다 (editorOpen === 'entity').
// 변경은 기존과 동일하게 실시간 반영.
export default function EntityEditPanel() {
  const t = useT();
  const {
    entities, selectedEntityId, editorOpen, closeEditor,
    updateEntity,
    addColumn, updateColumn, deleteColumn, moveColumn,
  } = useERDStore();

  const entity = entities.find(e => e.id === selectedEntityId);

  // 컬럼 드래그 순서 변경 상태
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const resetDrag = () => { setDragIdx(null); setOverIdx(null); };

  if (editorOpen !== 'entity' || !entity) return null;

  return (
    <EditorModal
      title={entity.name}
      icon="table_rows"
      onClose={closeEditor}
      testId="entity-editor-modal"
      headerActions={
        <button
          className="text-on-surface-variant hover:text-error transition-colors flex items-center cursor-pointer"
          onClick={() => { void confirmDeleteEntity(entity.id); }}
          title={t('delete.entity.title')}
          data-testid="entity-editor-delete"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      }
    >
      <div className="p-4 flex flex-col gap-6">
        {/* Table general info */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">{t('entity.tableName')}</label>
            <input
              className="bg-input-bg border border-outline-variant rounded px-3 py-2 text-on-surface font-mono text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              type="text"
              value={entity.name}
              onChange={e => updateEntity(entity.id, { name: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">{t('entity.logicalName')}</label>
            <input
              className="bg-input-bg border border-outline-variant rounded px-3 py-2 text-on-surface font-sans text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              type="text"
              placeholder={t('entity.logicalNamePlaceholder')}
              value={entity.logicalName ?? ''}
              onChange={e => updateEntity(entity.id, { logicalName: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Description / Notes</label>
            <textarea
              className="bg-input-bg border border-outline-variant rounded px-3 py-2 text-on-surface font-sans text-xs h-20 resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all custom-scrollbar"
              placeholder={t('entity.descriptionPlaceholder')}
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
              data-testid="add-column"
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
      </div>
    </EditorModal>
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
  const t = useT();
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
          title={t('column.dragReorder')}
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
          title={t('column.delete')}
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
              placeholder={t('column.namePlaceholder')}
              value={col.name}
              onChange={e => onUpdate({ name: e.target.value })}
            />
          </div>

          {/* 논리명 (한글 명칭) */}
          <input
            className="w-full bg-input-bg border border-outline-variant rounded px-2 py-1.5 text-on-surface font-sans text-xs focus:outline-none focus:border-primary"
            type="text"
            placeholder={t('column.logicalPlaceholder')}
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
              {!col.type && <option value="">{t('column.selectType')}</option>}
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
