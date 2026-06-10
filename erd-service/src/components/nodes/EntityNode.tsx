import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Entity, ENTITY_COLORS } from '../../types/erd';
import { useERDStore } from '../../store/erdStore';

type EntityNodeData = Entity;

const handleStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  background: '#8083ff',
  border: '2px solid #c0c1ff',
  borderRadius: '50%',
};

function EntityNode({ data }: NodeProps) {
  const entityData = data as unknown as EntityNodeData;
  const { updateEntity } = useERDStore();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(entityData.name);
  const [showPalette, setShowPalette] = useState(false);

  const pkCols = entityData.columns.filter(c => c.isPK);
  const nonPKCols = entityData.columns.filter(c => !c.isPK);

  const handleNameSubmit = () => {
    updateEntity(entityData.id, { name: nameVal.trim() || entityData.name });
    setEditingName(false);
  };

  return (
    /* Outer wrapper: NO overflow-hidden — handles must not be clipped */
    <div style={{ position: 'relative', minWidth: 250 }}>

      {/* Connection handles — outside the overflow-hidden content */}
      <Handle type="source" position={Position.Top}    id="top"      style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom"   style={handleStyle} />
      <Handle type="source" position={Position.Left}   id="left"     style={handleStyle} />
      <Handle type="source" position={Position.Right}  id="right"    style={handleStyle} />
      <Handle type="target" position={Position.Top}    id="top-t"    style={handleStyle} />
      <Handle type="target" position={Position.Bottom} id="bottom-t" style={handleStyle} />
      <Handle type="target" position={Position.Left}   id="left-t"   style={handleStyle} />
      <Handle type="target" position={Position.Right}  id="right-t"  style={handleStyle} />

      {/* Entity content — overflow-hidden for rounded corners only here */}
      <div className="entity-node bg-node-bg border border-node-border rounded-lg overflow-hidden flex flex-col">
        {/* 엔티티 색상 액센트 스트립 */}
        <div style={{ height: 3, background: entityData.color, flexShrink: 0 }} />

        {/* Header */}
        <div
          className="bg-node-header px-3 py-2 border-b border-node-border flex justify-between items-center cursor-pointer gap-2"
          style={{ minHeight: 36 }}
          onDoubleClick={() => { setEditingName(true); setNameVal(entityData.name); }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="material-symbols-outlined text-[16px] shrink-0"
              style={{ color: entityData.color }}
            >
              table_rows
            </span>
            {editingName ? (
              <input
                autoFocus
                className="font-mono text-xs font-bold text-on-surface bg-transparent outline-none border-b border-on-surface-variant w-full"
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={e => { if (e.key === 'Enter') handleNameSubmit(); if (e.key === 'Escape') setEditingName(false); }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="flex items-baseline gap-1.5 select-none">
                <span className="font-mono text-xs font-bold text-on-surface whitespace-nowrap">
                  {entityData.name}
                </span>
                {entityData.logicalName && (
                  <span className="font-sans text-[11px] text-on-surface-variant whitespace-nowrap shrink-0">
                    {entityData.logicalName}
                  </span>
                )}
              </span>
            )}
          </div>
          <button
            className="text-on-surface-variant hover:text-on-surface shrink-0 cursor-pointer flex items-center"
            title="색상 변경"
            onClick={e => { e.stopPropagation(); setShowPalette(v => !v); }}
          >
            <span className="material-symbols-outlined text-[16px]">more_horiz</span>
          </button>
        </div>

        {/* Color Palette */}
        {showPalette && (
          <div
            className="absolute z-[100] top-10 right-0 p-2 rounded-lg bg-surface-container border border-outline-variant shadow-xl grid grid-cols-4 gap-1"
            onClick={e => e.stopPropagation()}
          >
            {ENTITY_COLORS.map(c => (
              <button
                key={c}
                className="w-[22px] h-[22px] rounded-full cursor-pointer hover:scale-110 transition-transform"
                style={{
                  background: c,
                  border: entityData.color === c ? '2px solid #c0c1ff' : '2px solid transparent',
                }}
                onClick={() => { updateEntity(entityData.id, { color: c }); setShowPalette(false); }}
              />
            ))}
          </div>
        )}

        {/* PK Columns */}
        {pkCols.length > 0 && (
          <div className="border-b border-node-border py-1">
            {pkCols.map(col => (
              <div key={col.id} className="px-3 py-1 flex items-center justify-between gap-2 hover:bg-surface-variant group">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[14px] text-pk-color shrink-0" title="Primary Key">key</span>
                  {col.isFK && (
                    <span className="material-symbols-outlined text-[14px] text-fk-color shrink-0" title="Foreign Key">link</span>
                  )}
                  <span className="font-mono text-[11px] font-bold text-on-surface whitespace-nowrap">{col.name}</span>
                  {col.logicalName && (
                    <span className="font-sans text-[10px] text-on-surface-variant whitespace-nowrap shrink-0">{col.logicalName}</span>
                  )}
                  {col.isNN && <span className="text-pk-color text-[11px] shrink-0">*</span>}
                </div>
                <span className="font-mono text-[11px] text-on-surface-variant opacity-70 group-hover:opacity-100 shrink-0">
                  {col.type}{col.size ? `(${col.size})` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Non-PK Columns */}
        <div className="py-1">
          {nonPKCols.map(col => (
            <div key={col.id} className="px-3 py-1 flex items-center justify-between gap-2 hover:bg-surface-variant group">
              <div className={`flex items-center gap-2 min-w-0 ${col.isFK ? '' : 'pl-5'}`}>
                {col.isFK && (
                  <span className="material-symbols-outlined text-[14px] text-fk-color shrink-0" title="Foreign Key">link</span>
                )}
                <span className="font-mono text-[11px] text-on-surface whitespace-nowrap">{col.name}</span>
                {col.logicalName && (
                  <span className="font-sans text-[10px] text-on-surface-variant whitespace-nowrap shrink-0">{col.logicalName}</span>
                )}
                {col.isNN && <span className="text-pk-color text-[11px] shrink-0">*</span>}
              </div>
              <span className="font-mono text-[11px] text-on-surface-variant opacity-70 group-hover:opacity-100 shrink-0">
                {col.type}{col.size ? `(${col.size})` : ''}
              </span>
            </div>
          ))}

          {entityData.columns.length === 0 && (
            <div className="px-3 py-1.5 text-[11px] font-mono text-outline italic">
              컬럼 없음
            </div>
          )}
        </div>

        {/* SubSet — 배타적 서브타입 영역 (슈퍼타입 박스 안에 중첩) */}
        {(entityData.subtypes?.length ?? 0) > 0 && (
          <div className="border-t border-node-border bg-surface-variant/40 px-2 py-2" data-testid="subset-region">
            {/* SubSet 그룹 헤더 */}
            <div className="flex items-center gap-1.5 mb-1.5 px-1">
              <span className="material-symbols-outlined text-[13px] text-on-surface-variant shrink-0">account_tree</span>
              <span className="font-mono text-[10px] font-bold text-on-surface-variant whitespace-nowrap">
                {entityData.subsetName || 'SubSet'}
              </span>
              <span className="font-sans text-[9px] px-1 py-px rounded bg-surface-container text-on-surface-variant shrink-0">
                {(entityData.subtypeExclusive ?? true) ? '배타' : '포함'}·{(entityData.subtypeComplete ?? false) ? '완전' : '불완전'}
              </span>
            </div>
            {/* 중첩 서브타입 박스들 */}
            <div className="flex gap-2 flex-wrap">
              {entityData.subtypes!.map(st => (
                <div
                  key={st.id}
                  className="rounded-md border border-dashed border-node-border bg-node-bg min-w-[120px] flex-none"
                  data-testid="subtype-box"
                >
                  <div className="bg-node-header px-2 py-1 border-b border-node-border rounded-t-md flex items-baseline gap-1.5">
                    <span className="material-symbols-outlined text-[12px] shrink-0 self-center" style={{ color: entityData.color }}>category</span>
                    <span className="font-mono text-[10px] font-bold text-on-surface whitespace-nowrap">{st.name}</span>
                    {st.logicalName && (
                      <span className="font-sans text-[9px] text-on-surface-variant whitespace-nowrap shrink-0">{st.logicalName}</span>
                    )}
                  </div>
                  <div className="py-0.5">
                    {st.columns.map(col => (
                      <div key={col.id} className="px-2 py-0.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          {col.isFK && (
                            <span className="material-symbols-outlined text-[11px] text-fk-color shrink-0" title="Foreign Key">link</span>
                          )}
                          <span className="font-mono text-[10px] text-on-surface whitespace-nowrap" data-testid="subtype-col-name">{col.name}</span>
                          {col.logicalName && (
                            <span className="font-sans text-[9px] text-on-surface-variant whitespace-nowrap shrink-0">{col.logicalName}</span>
                          )}
                          {col.isNN && <span className="text-pk-color text-[10px] shrink-0">*</span>}
                        </div>
                        <span className="font-mono text-[9px] text-on-surface-variant opacity-70 shrink-0 whitespace-nowrap" data-testid="subtype-col-type">
                          {col.type}{col.size ? `(${col.size})` : ''}
                        </span>
                      </div>
                    ))}
                    {st.columns.length === 0 && (
                      <div className="px-2 py-0.5 text-[9px] font-mono text-outline italic">속성 없음</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(EntityNode);
