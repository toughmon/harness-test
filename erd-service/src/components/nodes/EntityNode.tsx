import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Column, ColumnType, Entity, ENTITY_COLORS, Relationship } from '../../types/erd';
import { useERDStore } from '../../store/erdStore';
import { deriveSides, labelForSides } from '../../core/relationshipSides';

type EntityNodeData = Entity;

const handleStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  background: '#8083ff',
  border: '2px solid #c0c1ff',
  borderRadius: '50%',
};

// 서브타입 박스 전용 연결점 — 박스가 작아 엔티티 핸들(16px)보다 축소
const subtypeHandleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: '#8083ff',
  border: '2px solid #c0c1ff',
  borderRadius: '50%',
  right: -6,
};

function parseTypeAndSize(rawStr: string): { type: ColumnType; size: string } {
  const trimmed = rawStr.trim();
  if (!trimmed) return { type: 'VARCHAR', size: '255' };

  const match = trimmed.match(/^([a-zA-Z0-9_\s]+)(?:\(([^)]*)\))?$/);
  if (match) {
    const typeCandidate = match[1].trim().toUpperCase();
    const size = match[2] ? match[2].trim() : '';
    return { type: typeCandidate as ColumnType, size };
  }
  return { type: trimmed.toUpperCase() as ColumnType, size: '' };
}

function InlineInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  return (
    <input
      ref={inputRef}
      className={`bg-surface-container text-on-surface border border-primary rounded px-1 py-px outline-none ${className}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onSubmit}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') onSubmit();
        if (e.key === 'Escape') onCancel();
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    />
  );
}

function EntityNode({ data }: NodeProps) {
  const entityData = data as unknown as EntityNodeData;
  const { updateEntity, updateColumn, updateSubtypeColumn, openEntityEditor, entities, relationships } = useERDStore();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [showPalette, setShowPalette] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // 아이콘과 팝오버 사이 작은 간격을 마우스가 지나갈 때 깜빡이지 않도록 약간의 유예를 둔다
  const hideTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current); }, []);
  const cancelHide = () => { if (hideTimerRef.current) { window.clearTimeout(hideTimerRef.current); hideTimerRef.current = null; } };
  const openPreview = () => { cancelHide(); setShowPreview(true); };
  const scheduleHidePreview = () => { cancelHide(); hideTimerRef.current = window.setTimeout(() => setShowPreview(false), 150); };

  const pkCols = entityData.columns.filter(c => c.isPK);
  const nonPKCols = entityData.columns.filter(c => !c.isPK);

  const startEditing = (key: string, initialVal: string) => {
    setEditingKey(key);
    setEditVal(initialVal);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditVal('');
  };

  const handleFieldSubmit = () => {
    if (!editingKey) return;

    if (editingKey === 'entity-name') {
      const val = editVal.trim();
      if (val && val !== entityData.name) {
        updateEntity(entityData.id, { name: val });
      }
    } else if (editingKey === 'entity-logicalName') {
      updateEntity(entityData.id, { logicalName: editVal.trim() });
    } else if (editingKey.startsWith('col-name-')) {
      const colId = editingKey.replace('col-name-', '');
      const val = editVal.trim();
      if (val) {
        updateColumn(entityData.id, colId, { name: val });
      }
    } else if (editingKey.startsWith('col-logicalName-')) {
      const colId = editingKey.replace('col-logicalName-', '');
      updateColumn(entityData.id, colId, { logicalName: editVal.trim() });
    } else if (editingKey.startsWith('col-type-')) {
      const colId = editingKey.replace('col-type-', '');
      const { type, size } = parseTypeAndSize(editVal);
      updateColumn(entityData.id, colId, { type, size });
    } else if (editingKey.startsWith('subcol-name-')) {
      const parts = editingKey.split('-');
      const stId = parts[2];
      const colId = parts[3];
      const val = editVal.trim();
      if (val && updateSubtypeColumn) {
        updateSubtypeColumn(entityData.id, stId, colId, { name: val });
      }
    } else if (editingKey.startsWith('subcol-logicalName-')) {
      const parts = editingKey.split('-');
      const stId = parts[2];
      const colId = parts[3];
      if (updateSubtypeColumn) {
        updateSubtypeColumn(entityData.id, stId, colId, { logicalName: editVal.trim() });
      }
    } else if (editingKey.startsWith('subcol-type-')) {
      const parts = editingKey.split('-');
      const stId = parts[2];
      const colId = parts[3];
      const { type, size } = parseTypeAndSize(editVal);
      if (updateSubtypeColumn) {
        updateSubtypeColumn(entityData.id, stId, colId, { type, size });
      }
    }

    cancelEditing();
  };

  const renderColumnRow = (col: Column, isPK: boolean) => {
    const isEditingName = editingKey === `col-name-${col.id}`;
    const isEditingLogical = editingKey === `col-logicalName-${col.id}`;
    const isEditingType = editingKey === `col-type-${col.id}`;

    return (
      <div key={col.id} className="px-3 py-1 flex items-center justify-between gap-2 hover:bg-surface-variant group">
        <div className={`flex items-center gap-1.5 min-w-0 flex-1 ${!isPK && !col.isFK ? 'pl-5' : ''}`}>
          {isPK && (
            <span className="material-symbols-outlined text-[14px] text-pk-color shrink-0" title="Primary Key">key</span>
          )}
          {col.isFK && (
            <span className="material-symbols-outlined text-[14px] text-fk-color shrink-0" title="Foreign Key">link</span>
          )}

          {isEditingName ? (
            <InlineInput
              value={editVal}
              onChange={setEditVal}
              onSubmit={handleFieldSubmit}
              onCancel={cancelEditing}
              className="font-mono text-[11px] font-bold w-full min-w-[60px]"
            />
          ) : (
            <span
              className="font-mono text-[11px] font-bold text-on-surface whitespace-nowrap cursor-pointer hover:text-primary hover:underline"
              title="더블클릭하여 속성명 수정"
              data-testid="col-name"
              onDoubleClick={e => {
                e.stopPropagation();
                startEditing(`col-name-${col.id}`, col.name);
              }}
            >
              {col.name}
            </span>
          )}

          {isEditingLogical ? (
            <InlineInput
              value={editVal}
              onChange={setEditVal}
              onSubmit={handleFieldSubmit}
              onCancel={cancelEditing}
              className="font-sans text-[10px] w-full min-w-[50px]"
            />
          ) : (
            <span
              className="font-sans text-[10px] text-on-surface-variant whitespace-nowrap shrink-0 cursor-pointer hover:text-primary hover:underline"
              title="더블클릭하여 한글명 수정"
              data-testid="col-logical-name"
              onDoubleClick={e => {
                e.stopPropagation();
                startEditing(`col-logicalName-${col.id}`, col.logicalName || '');
              }}
            >
              {col.logicalName ? (
                col.logicalName
              ) : (
                <span className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-outline text-[9px] italic">
                  +한글명
                </span>
              )}
            </span>
          )}

          {col.isNN && <span className="text-pk-color text-[11px] shrink-0">*</span>}
        </div>

        {isEditingType ? (
          <InlineInput
            value={editVal}
            onChange={setEditVal}
            onSubmit={handleFieldSubmit}
            onCancel={cancelEditing}
            className="font-mono text-[11px] w-28 text-right"
          />
        ) : (
          <span
            className="font-mono text-[11px] text-on-surface-variant opacity-70 group-hover:opacity-100 shrink-0 cursor-pointer hover:text-primary hover:underline"
            title="더블클릭하여 데이터타입 수정"
            data-testid="col-type"
            onDoubleClick={e => {
              e.stopPropagation();
              const typeStr = `${col.type}${col.size ? `(${col.size})` : ''}`;
              startEditing(`col-type-${col.id}`, typeStr);
            }}
          >
            {col.type}{col.size ? `(${col.size})` : ''}
          </span>
        )}
      </div>
    );
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
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="material-symbols-outlined text-[16px] shrink-0"
              style={{ color: entityData.color }}
            >
              table_rows
            </span>

            {editingKey === 'entity-name' ? (
              <InlineInput
                value={editVal}
                onChange={setEditVal}
                onSubmit={handleFieldSubmit}
                onCancel={cancelEditing}
                className="font-mono text-xs font-bold w-full"
              />
            ) : (
              <span
                className="font-mono text-xs font-bold text-on-surface whitespace-nowrap cursor-pointer hover:text-primary hover:underline"
                title="더블클릭하여 물리명 수정"
                onDoubleClick={e => {
                  e.stopPropagation();
                  startEditing('entity-name', entityData.name);
                }}
              >
                {entityData.name}
              </span>
            )}

            {editingKey === 'entity-logicalName' ? (
              <InlineInput
                value={editVal}
                onChange={setEditVal}
                onSubmit={handleFieldSubmit}
                onCancel={cancelEditing}
                className="font-sans text-[11px] w-full"
              />
            ) : (
              <span
                className="font-sans text-[11px] text-on-surface-variant whitespace-nowrap shrink-0 cursor-pointer hover:text-primary hover:underline"
                title="더블클릭하여 한글명 수정"
                onDoubleClick={e => {
                  e.stopPropagation();
                  startEditing('entity-logicalName', entityData.logicalName || '');
                }}
              >
                {entityData.logicalName ? (
                  entityData.logicalName
                ) : (
                  <span className="opacity-0 hover:opacity-100 text-outline text-[10px] italic">
                    +한글명
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div
              className="flex items-center"
              onMouseEnter={openPreview}
              onMouseLeave={scheduleHidePreview}
            >
              <button
                className="text-on-surface-variant hover:text-primary cursor-pointer flex items-center"
                title="상세 정보 / 편집"
                data-testid="entity-info-icon"
                onClick={e => { e.stopPropagation(); cancelHide(); setShowPreview(false); openEntityEditor(entityData.id); }}
              >
                <span className="material-symbols-outlined text-[16px]">info</span>
              </button>
            </div>
            <button
              className="text-on-surface-variant hover:text-on-surface cursor-pointer flex items-center"
              title="색상 변경"
              onClick={e => { e.stopPropagation(); setShowPalette(v => !v); }}
            >
              <span className="material-symbols-outlined text-[16px]">more_horiz</span>
            </button>
          </div>
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
            {pkCols.map(col => renderColumnRow(col, true))}
          </div>
        )}

        {/* Non-PK Columns */}
        <div className="py-1">
          {nonPKCols.map(col => renderColumnRow(col, false))}

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
                  style={{ position: 'relative' }}
                  data-testid="subtype-box"
                >
                  {/* 서브타입 전용 연결점 */}
                  <Handle type="source" position={Position.Right} id={`sub:${st.id}`} style={subtypeHandleStyle} />
                  <div className="bg-node-header px-2 py-1 border-b border-node-border rounded-t-md flex items-baseline gap-1.5">
                    <span className="material-symbols-outlined text-[12px] shrink-0 self-center" style={{ color: entityData.color }}>category</span>

                    {editingKey === `subtype-name-${st.id}` ? (
                      <InlineInput
                        value={editVal}
                        onChange={setEditVal}
                        onSubmit={handleFieldSubmit}
                        onCancel={cancelEditing}
                        className="font-mono text-[10px] font-bold w-full"
                      />
                    ) : (
                      <span
                        className="font-mono text-[10px] font-bold text-on-surface whitespace-nowrap cursor-pointer hover:text-primary hover:underline"
                        title="더블클릭하여 서브타입명 수정"
                        onDoubleClick={e => {
                          e.stopPropagation();
                          startEditing(`subtype-name-${st.id}`, st.name);
                        }}
                      >
                        {st.name}
                      </span>
                    )}

                    {editingKey === `subtype-logicalName-${st.id}` ? (
                      <InlineInput
                        value={editVal}
                        onChange={setEditVal}
                        onSubmit={handleFieldSubmit}
                        onCancel={cancelEditing}
                        className="font-sans text-[9px] w-full"
                      />
                    ) : (
                      <span
                        className="font-sans text-[9px] text-on-surface-variant whitespace-nowrap shrink-0 cursor-pointer hover:text-primary hover:underline"
                        title="더블클릭하여 한글명 수정"
                        onDoubleClick={e => {
                          e.stopPropagation();
                          startEditing(`subtype-logicalName-${st.id}`, st.logicalName || '');
                        }}
                      >
                        {st.logicalName ? (
                          st.logicalName
                        ) : (
                          <span className="opacity-0 hover:opacity-100 text-outline text-[8px] italic">
                            +한글명
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="py-0.5">
                    {st.columns.map(col => {
                      const isEditingSubName = editingKey === `subcol-name-${st.id}-${col.id}`;
                      const isEditingSubLogical = editingKey === `subcol-logicalName-${st.id}-${col.id}`;
                      const isEditingSubTypes = editingKey === `subcol-type-${st.id}-${col.id}`;

                      return (
                        <div key={col.id} className="px-2 py-0.5 flex items-center justify-between gap-2 group hover:bg-surface-variant/50">
                          <div className="flex items-center gap-1 min-w-0">
                            {col.isFK && (
                              <span className="material-symbols-outlined text-[11px] text-fk-color shrink-0" title="Foreign Key">link</span>
                            )}
                            {isEditingSubName ? (
                              <InlineInput
                                value={editVal}
                                onChange={setEditVal}
                                onSubmit={handleFieldSubmit}
                                onCancel={cancelEditing}
                                className="font-mono text-[10px] w-full min-w-[40px]"
                              />
                            ) : (
                              <span
                                className="font-mono text-[10px] text-on-surface whitespace-nowrap cursor-pointer hover:text-primary hover:underline"
                                data-testid="subtype-col-name"
                                title="더블클릭하여 속성명 수정"
                                onDoubleClick={e => {
                                  e.stopPropagation();
                                  startEditing(`subcol-name-${st.id}-${col.id}`, col.name);
                                }}
                              >
                                {col.name}
                              </span>
                            )}

                            {isEditingSubLogical ? (
                              <InlineInput
                                value={editVal}
                                onChange={setEditVal}
                                onSubmit={handleFieldSubmit}
                                onCancel={cancelEditing}
                                className="font-sans text-[9px] w-full min-w-[40px]"
                              />
                            ) : (
                              <span
                                className="font-sans text-[9px] text-on-surface-variant whitespace-nowrap shrink-0 cursor-pointer hover:text-primary hover:underline"
                                title="더블클릭하여 한글명 수정"
                                onDoubleClick={e => {
                                  e.stopPropagation();
                                  startEditing(`subcol-logicalName-${st.id}-${col.id}`, col.logicalName || '');
                                }}
                              >
                                {col.logicalName ? (
                                  col.logicalName
                                ) : (
                                  <span className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-outline text-[8px] italic">
                                    +한글명
                                  </span>
                                )}
                              </span>
                            )}
                            {col.isNN && <span className="text-pk-color text-[10px] shrink-0">*</span>}
                          </div>

                          {isEditingSubTypes ? (
                            <InlineInput
                              value={editVal}
                              onChange={setEditVal}
                              onSubmit={handleFieldSubmit}
                              onCancel={cancelEditing}
                              className="font-mono text-[9px] w-24 text-right"
                            />
                          ) : (
                            <span
                              className="font-mono text-[9px] text-on-surface-variant opacity-70 shrink-0 whitespace-nowrap cursor-pointer hover:text-primary hover:underline"
                              data-testid="subtype-col-type"
                              title="더블클릭하여 데이터타입 수정"
                              onDoubleClick={e => {
                                e.stopPropagation();
                                const typeStr = `${col.type}${col.size ? `(${col.size})` : ''}`;
                                startEditing(`subcol-type-${st.id}-${col.id}`, typeStr);
                              }}
                            >
                              {col.type}{col.size ? `(${col.size})` : ''}
                            </span>
                          )}
                        </div>
                      );
                    })}
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

      {/* entity-node는 모서리를 둥글게 하려 overflow-hidden이라 팝오버를 안쪽에 두면 잘림 — 핸들과 같은 이유로 바깥(비클리핑) 래퍼에 렌더 */}
      {showPreview && (
        <EntityHoverPreview
          entity={entityData}
          entities={entities}
          relationships={relationships}
          onMouseEnter={openPreview}
          onMouseLeave={scheduleHidePreview}
        />
      )}
    </div>
  );
}

// FK 컬럼이 실제로 어느 엔티티·컬럼을 참조하는지 — 캔버스 노드에는 링크 아이콘만 있어 대상이 안 보인다.
function fkTargetLabel(col: Column, entities: Entity[]): string | null {
  if (!col.isFK || !col.refEntityId) return null;
  const target = entities.find(e => e.id === col.refEntityId);
  if (!target) return '⚠ 참조 엔티티 없음';
  const targetCol = target.columns.find(c => c.id === col.refColumnId);
  return targetCol ? `${target.name}.${targetCol.name}` : `⚠ ${target.name}.(끊어진 참조)`;
}

// info 아이콘 호버 시 표시되는 읽기전용 미리보기
function EntityHoverPreview({ entity, entities, relationships, onMouseEnter, onMouseLeave }: {
  entity: EntityNodeData;
  entities: Entity[];
  relationships: Relationship[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const related = relationships.filter(r => r.sourceId === entity.id || r.targetId === entity.id);

  return (
    <div
      className="absolute z-[90] top-10 right-0 w-72 max-h-80 overflow-y-auto custom-scrollbar p-3 rounded-lg bg-surface-container border border-outline-variant shadow-xl flex flex-col gap-2"
      data-testid="entity-hover-preview"
      onClick={e => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className="font-mono text-xs font-bold text-on-surface whitespace-nowrap">{entity.name}</span>
        {entity.logicalName && (
          <span className="font-sans text-[11px] text-on-surface-variant whitespace-nowrap">{entity.logicalName}</span>
        )}
      </div>

      <p className="text-[11px] text-on-surface-variant m-0 whitespace-pre-line">
        {entity.description || <span className="italic text-outline">설명 없음</span>}
      </p>

      <div className="w-full h-px bg-outline-variant/50" />

      <div className="flex flex-col gap-1">
        {entity.columns.map(col => {
          const fkTarget = fkTargetLabel(col, entities);
          return (
            <div key={col.id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1 min-w-0">
                  {col.isPK && <span className="material-symbols-outlined text-[12px] text-pk-color shrink-0" title="Primary Key">key</span>}
                  {col.isFK && <span className="material-symbols-outlined text-[12px] text-fk-color shrink-0" title="Foreign Key">link</span>}
                  <span className="font-mono text-on-surface whitespace-nowrap truncate">{col.name}</span>
                  {col.isNN && <span className="text-pk-color shrink-0">*</span>}
                  {col.isUnique && <span className="font-sans text-[9px] px-1 rounded bg-surface-variant text-on-surface-variant shrink-0">UQ</span>}
                </div>
                <span className="font-mono text-on-surface-variant opacity-70 shrink-0">
                  {col.type}{col.size ? `(${col.size})` : ''}
                </span>
              </div>
              {fkTarget && (
                <div className="pl-4 font-mono text-[9px] text-fk-color/80 whitespace-nowrap truncate" data-testid="fk-target">
                  → {fkTarget}
                </div>
              )}
            </div>
          );
        })}
        {entity.columns.length === 0 && (
          <p className="text-[11px] font-mono text-outline italic m-0">컬럼 없음</p>
        )}
      </div>

      {(entity.subtypes?.length ?? 0) > 0 && (
        <>
          <div className="w-full h-px bg-outline-variant/50" />
          <p className="text-[11px] text-on-surface-variant m-0">
            {entity.subsetName || 'SubSet'} · {entity.subtypes!.map(st => st.name).join(', ')}
          </p>
        </>
      )}

      <div className="w-full h-px bg-outline-variant/50" />

      <div className="flex flex-col gap-1" data-testid="entity-relations-summary">
        <span className="font-sans text-[10px] font-bold text-on-surface-variant">
          관계 {related.length > 0 ? `(${related.length})` : ''}
        </span>
        {related.map(rel => {
          const iAmSource = rel.sourceId === entity.id;
          const other = entities.find(e => e.id === (iAmSource ? rel.targetId : rel.sourceId));
          const role = iAmSource ? '자식' : '부모';
          const mySubtypeId = iAmSource ? rel.sourceSubtypeId : rel.targetSubtypeId;
          const scopeName = mySubtypeId ? entity.subtypes?.find(st => st.id === mySubtypeId)?.name : undefined;
          return (
            <div key={rel.id} className="flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1 min-w-0">
                <span className={`font-sans text-[9px] px-1 rounded shrink-0 ${iAmSource ? 'bg-fk-color/20 text-fk-color' : 'bg-pk-color/20 text-pk-color'}`}>
                  {role}
                </span>
                <span className="font-mono text-on-surface whitespace-nowrap truncate">
                  {other?.name ?? '?'}
                </span>
                {other?.logicalName && (
                  <span className="font-sans text-[10px] text-on-surface-variant whitespace-nowrap truncate">{other.logicalName}</span>
                )}
                {scopeName && (
                  <span className="font-sans text-[9px] px-1 rounded bg-surface-variant text-on-surface-variant shrink-0">{scopeName}</span>
                )}
              </div>
              <span className="font-sans text-[9px] text-on-surface-variant opacity-70 shrink-0 whitespace-nowrap">
                {labelForSides(deriveSides(rel))}
              </span>
            </div>
          );
        })}
        {related.length === 0 && (
          <p className="text-[11px] font-mono text-outline italic m-0">연결된 관계 없음</p>
        )}
      </div>
    </div>
  );
}

export default memo(EntityNode);

