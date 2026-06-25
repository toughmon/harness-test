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

  // 다른 곳(우측 패널)에서 텍스트가 바뀌면 노드 textarea에 반영한다.
  // 단, 이 textarea에 포커스가 있으면(=사용자가 여기서 입력 중이면) DOM value를 절대 건드리지 않는다.
  // controlled 갱신/programmatic value 쓰기는 한글 IME 조합 버퍼를 깨뜨려 글자가 누락된다.
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

      {/* Text area — uncontrolled(defaultValue+ref). value prop을 쓰지 않아 React가 입력 중 DOM을 덮어쓰지 않음. */}
      <textarea
        ref={taRef}
        defaultValue={memo.text}
        className="nodrag nopan flex-1 bg-transparent resize-none outline-none border-none p-2 text-[13px] leading-relaxed placeholder:text-gray-400"
        style={{ color: '#1e293b', fontFamily: 'inherit' }}
        onChange={e => updateMemo(memo.id, { text: e.target.value })}
        onFocus={() => { focusedRef.current = true; selectMemo(memo.id); }}
        onBlur={() => { focusedRef.current = false; }}
        placeholder="메모를 입력하세요..."
      />
    </div>
  );
}
