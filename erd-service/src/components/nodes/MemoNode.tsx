import { useRef, useEffect } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { useERDStore } from '../../store/erdStore';
import { Memo, MEMO_COLORS } from '../../types/erd';

export default function MemoNode({ data }: NodeProps) {
  const memo = data as unknown as Memo;
  const { updateMemo, deleteMemo, selectMemo, selectedMemoId, updateMemoSize } = useERDStore();
  const isSelected = selectedMemoId === memo.id;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const focusedRef = useRef(false);

  // 다른 곳(우측 패널)에서 텍스트가 바뀌면 노드 textarea에 반영.
  // 입력 중(포커스 보유)에는 절대 건드리지 않는다 — IME 조합 취소 방지.
  useEffect(() => {
    const ta = taRef.current;
    if (ta && !focusedRef.current && ta.value !== memo.text) {
      ta.value = memo.text;
    }
  }, [memo.text]);

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

      {/* Text area — 순수 uncontrolled. 입력 중에는 store를 갱신하지 않아(리렌더 0) IME 조합이 안전하다.
          포커스가 빠질 때(onBlur)만 한 번 store에 저장한다. */}
      <textarea
        ref={taRef}
        defaultValue={memo.text}
        className="nodrag nopan flex-1 bg-transparent resize-none outline-none border-none p-2 text-[13px] leading-relaxed placeholder:text-gray-400"
        style={{ color: '#1e293b', fontFamily: 'inherit' }}
        onFocus={() => { focusedRef.current = true; selectMemo(memo.id); }}
        onBlur={e => { focusedRef.current = false; updateMemo(memo.id, { text: e.target.value }); }}
        placeholder="메모를 입력하세요..."
      />
    </div>
  );
}
