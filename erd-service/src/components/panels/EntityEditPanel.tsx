import { useState } from 'react';
import { useERDStore } from '../../store/erdStore';
import { COLUMN_TYPES, Column, ColumnType } from '../../types/erd';

export default function EntityEditPanel() {
  const {
    entities, selectedEntityId, selectEntity,
    updateEntity, deleteEntity,
    addColumn, updateColumn, deleteColumn,
  } = useERDStore();

  const entity = entities.find(e => e.id === selectedEntityId);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  if (!entity) return null;

  return (
    <div
      style={{
        width: 288, height: '100%', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', background: '#0f172a', borderLeft: '1px solid #1e293b',
        flexShrink: 0,
      }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <span className="text-sm font-semibold text-slate-200">엔티티 편집</span>
        <div className="flex gap-2">
          <button
            className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-900/30"
            onClick={() => deleteEntity(entity.id)}
            title="엔티티 삭제"
          >
            삭제
          </button>
          <button
            className="text-slate-400 hover:text-slate-200 text-lg leading-none"
            onClick={() => selectEntity(null)}
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Entity name */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">엔티티명</label>
          <input
            className="w-full bg-slate-800 text-slate-100 text-sm px-3 py-2 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
            value={entity.name}
            onChange={e => updateEntity(entity.id, { name: e.target.value })}
          />
        </div>

        {/* Columns */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400">컬럼</label>
            <button
              className="text-xs px-2 py-1 rounded bg-blue-700 text-white hover:bg-blue-600"
              onClick={() => addColumn(entity.id)}
            >
              + 추가
            </button>
          </div>

          <div className="space-y-2">
            {entity.columns.map((col, idx) => (
              <ColumnRow
                key={col.id}
                col={col}
                idx={idx}
                entityId={entity.id}
                onUpdate={(updates) => updateColumn(entity.id, col.id, updates)}
                onDelete={() => deleteColumn(entity.id, col.id)}
                dragging={dragIdx === idx}
                onDragStart={() => setDragIdx(idx)}
                onDragEnd={() => setDragIdx(null)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ColRowProps {
  col: Column;
  idx: number;
  entityId: string;
  onUpdate: (updates: Partial<Column>) => void;
  onDelete: () => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function ColumnRow({ col, onUpdate, onDelete }: ColRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded border border-slate-700 overflow-hidden"
      style={{ background: '#1e293b' }}
    >
      {/* Row summary */}
      <div className="flex items-center gap-1 px-2 py-1.5 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <span className="text-xs font-mono w-4 shrink-0" style={{ color: col.isPK ? '#fbbf24' : '#94a3b8' }}>
          {col.isPK ? '#' : col.isFK ? '→' : '·'}
        </span>
        <span className="text-xs text-slate-200 flex-1 truncate">{col.name || '(unnamed)'}</span>
        <span className="text-xs text-slate-500 shrink-0">
          {col.type}{col.size ? `(${col.size})` : ''}
        </span>
        <button
          className="text-slate-600 hover:text-red-400 text-sm ml-1 shrink-0"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          ×
        </button>
      </div>

      {/* Expanded editor */}
      {open && (
        <div className="px-2 pb-2 pt-1 space-y-2 border-t border-slate-700">
          {/* Name */}
          <div>
            <label className="text-xs text-slate-500 block mb-0.5">컬럼명</label>
            <input
              className="w-full bg-slate-900 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
              value={col.name}
              onChange={e => onUpdate({ name: e.target.value })}
            />
          </div>

          {/* Type + Size */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-500 block mb-0.5">타입</label>
              <select
                className="w-full bg-slate-900 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                value={col.type}
                onChange={e => onUpdate({ type: e.target.value as ColumnType })}
              >
                {COLUMN_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label className="text-xs text-slate-500 block mb-0.5">크기</label>
              <input
                className="w-full bg-slate-900 text-slate-100 text-xs px-2 py-1 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                value={col.size}
                placeholder="255"
                onChange={e => onUpdate({ size: e.target.value })}
              />
            </div>
          </div>

          {/* Constraints */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {[
              { key: 'isPK', label: 'PK' },
              { key: 'isFK', label: 'FK' },
              { key: 'isNN', label: 'NOT NULL' },
              { key: 'isUnique', label: 'UNIQUE' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-blue-500 w-3 h-3"
                  checked={col[key as keyof Column] as boolean}
                  onChange={e => onUpdate({ [key]: e.target.checked })}
                />
                <span className="text-xs text-slate-400">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
