import { useRef } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { useERDStore } from '../../store/erdStore';
import { Memo, MEMO_COLORS } from '../../types/erd';

export default function MemoNode({ data }: NodeProps) {
  const memo = data as unknown as Memo;
  const { updateMemo, deleteMemo, selectMemo, selectedMemoId, updateMemoSize } = useERDStore();
  const isSelected = selectedMemoId === memo.id;
  const composingRef = useRef(false);

  return (
    <div
      className="w-full h-full flex flex-col rounded-lg overflow-hidden shadow-lg group"
      style={{ background: memo.color, minWidth: 120, minHeight: 80 }}
      data-testid="memo-node"
      data-memo-id={memo.id}
      onClick={(e) => { e.stopPropagation(); selectMemo(memo.id); }}
    >
      <NodeResizer
        isVisible={isSelected}
        minWidth={120}
        minHeight={80}
        lineStyle={{ borderColor: '#6366f1', borderWidth: 1 }}
        handleStyle={{ borderColor: '#6366f1', background: '#fff', width: 8, height: 8, borderRadius: 2 }}
        onResizeEnd={(_, params) => updateMemoSize(memo.id, params.width, params.height)}
      />

      {/* Header bar */}
      <div
        className="shrink-0 flex items-center justify-between px-2"
        style={{ height: 24, background: 'rgba(0,0,0,0.10)' }}
      >
        <span className="material-symbols-outlined text-[14px]" style={{ color: '#374151', fontSize: 14 }}>
          sticky_note_2
        </span>
        <div className="flex items-center gap-0.5">
          {/* 색상 변경 점들 */}
          {MEMO_COLORS.map(c => (
            <button
              key={c}
              className="nodrag w-3 h-3 rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:scale-125"
              style={{
                background: c,
                border: memo.color === c ? '1.5px solid #374151' : '1.5px solid rgba(55,65,81,0.3)',
              }}
              onClick={e => { e.stopPropagation(); updateMemo(memo.id, { color: c }); }}
              title={`색상 변경`}
            />
          ))}
          <button
            className={`nodrag material-symbols-outlined cursor-pointer transition-opacity ml-1 hover:!opacity-100 ${isSelected ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'}`}
            style={{ color: '#374151', fontSize: 14 }}
            onClick={e => { e.stopPropagation(); deleteMemo(memo.id); }}
            title="메모 삭제"
          >
            close
          </button>
        </div>
      </div>

      {/* Text area */}
      <textarea
        className="nodrag nopan flex-1 bg-transparent resize-none outline-none border-none p-2 text-[13px] leading-relaxed placeholder:text-gray-400"
        style={{ color: '#1e293b', fontFamily: 'inherit' }}
        value={memo.text}
        onChange={e => { if (!composingRef.current) updateMemo(memo.id, { text: e.target.value }); }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={e => { composingRef.current = false; updateMemo(memo.id, { text: (e.target as HTMLTextAreaElement).value }); }}
        onClick={() => selectMemo(memo.id)}
        placeholder="메모를 입력하세요..."
      />
    </div>
  );
}
