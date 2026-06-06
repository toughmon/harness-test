import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Entity, ENTITY_COLORS } from '../../types/erd';
import { useERDStore } from '../../store/erdStore';

type EntityNodeData = Entity;

const handleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: '#60a5fa',
  border: '2px solid #1e40af',
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
    <div style={{ position: 'relative', minWidth: 180 }}>

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
      <div
        style={{
          background: '#1e293b',
          border: '2px solid #334155',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: entityData.color,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            minHeight: 34,
            cursor: 'pointer',
          }}
          onDoubleClick={() => { setEditingName(true); setNameVal(entityData.name); }}
        >
          {editingName ? (
            <input
              autoFocus
              style={{
                background: 'transparent', color: 'white', fontWeight: 'bold',
                fontSize: 13, outline: 'none', borderBottom: '1px solid rgba(255,255,255,0.6)',
                width: '100%',
              }}
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={e => { if (e.key === 'Enter') handleNameSubmit(); if (e.key === 'Escape') setEditingName(false); }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span style={{ color: 'white', fontWeight: 'bold', fontSize: 13, userSelect: 'none' }}>
              {entityData.name}
            </span>
          )}
          <button
            style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '1.5px solid rgba(255,255,255,0.5)',
              background: entityData.color, cursor: 'pointer', flexShrink: 0,
            }}
            title="색상 변경"
            onClick={e => { e.stopPropagation(); setShowPalette(v => !v); }}
          />
        </div>

        {/* Color Palette */}
        {showPalette && (
          <div
            style={{
              position: 'absolute', zIndex: 100, top: 36, right: 0,
              padding: 8, borderRadius: 8,
              background: '#0f172a', border: '1px solid #334155',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
            }}
            onClick={e => e.stopPropagation()}
          >
            {ENTITY_COLORS.map(c => (
              <button
                key={c}
                style={{
                  width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                  background: c,
                  border: entityData.color === c ? '2px solid white' : '2px solid transparent',
                  transition: 'transform 0.1s',
                }}
                onClick={() => { updateEntity(entityData.id, { color: c }); setShowPalette(false); }}
              />
            ))}
          </div>
        )}

        {/* PK Columns */}
        {pkCols.length > 0 && (
          <div style={{ borderBottom: '1px solid #334155' }}>
            {pkCols.map(col => (
              <div key={col.id} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', fontSize: 12, color: '#fbbf24',
              }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 'bold', flexShrink: 0 }}>PK</span>
                {col.isFK && <span style={{ fontFamily: 'monospace', color: '#f472b6', flexShrink: 0 }}>FK</span>}
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {col.name}
                </span>
                <span style={{ marginLeft: 'auto', color: '#64748b', flexShrink: 0, fontSize: 11 }}>
                  {col.type}{col.size ? `(${col.size})` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Non-PK Columns */}
        {nonPKCols.map(col => (
          <div key={col.id} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', fontSize: 12, color: '#cbd5e1',
            borderBottom: '1px solid #1e293b',
          }}>
            {col.isFK
              ? <span style={{ fontFamily: 'monospace', color: '#f472b6', flexShrink: 0 }}>FK</span>
              : <span style={{ width: 20, flexShrink: 0 }} />
            }
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {col.name}
            </span>
            {col.isNN && <span style={{ color: '#fb923c', flexShrink: 0 }}>*</span>}
            <span style={{ marginLeft: 'auto', color: '#475569', flexShrink: 0, fontSize: 11 }}>
              {col.type}{col.size ? `(${col.size})` : ''}
            </span>
          </div>
        ))}

        {entityData.columns.length === 0 && (
          <div style={{ padding: '6px 10px', fontSize: 12, color: '#475569', fontStyle: 'italic' }}>
            컬럼 없음
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(EntityNode);
