import { useRef, useState, useEffect } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { useERDStore } from '../../store/erdStore';
import { Memo, MEMO_COLORS } from '../../types/erd';

export default function MemoNode({ data }: NodeProps) {
  const memo = data as unknown as Memo;
  const { updateMemo, deleteMemo, selectMemo, selectedMemoId, updateMemoSize } = useERDStore();
  const isSelected = selectedMemoId === memo.id;

  // 로컬 표시용 텍스트 — 스토어보다 먼저 화면에 반영해 IME 조합과 충돌 방지
  const [localText, setLocalText] = useState(memo.text);
  const composingRef = useRef(false);

  // 패널 등 외부에서 memo.text가 바뀌면 동기화 (조합 중이면 건너뜀)
  useEffect(() => {
    if (!composingRef.current) setLocalText(memo.text);
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

      {/* Text area */}
      <textarea
        className="nodrag nopan flex-1 bg-transparent resize-none outline-none border-none p-2 text-[13px] leading-relaxed placeholder:text-gray-400"
        style={{ color: '#1e293b', fontFamily: 'inherit' }}
        value={localText}
        onChange={e => {
          const text = e.target.value;
          setLocalText(text); // 항상 즉시 표시 업데이트
          if (!composingRef.current) updateMemo(memo.id, { text }); // 조합 중 스토어 쓰기 차단
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={e => {
          composingRef.current = false;
          const text = (e.target as HTMLTextAreaElement).value;
          setLocalText(text);
          updateMemo(memo.id, { text });
        }}
        onClick={() => selectMemo(memo.id)}
        placeholder="메모를 입력하세요..."
      />
    </div>
  );
}
