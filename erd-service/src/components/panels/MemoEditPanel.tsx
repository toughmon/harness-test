import { useRef, useEffect } from 'react';
import { useERDStore } from '../../store/erdStore';
import { MEMO_COLORS } from '../../types/erd';
import { confirmDialog } from '../../store/dialogStore';

export default function MemoEditPanel() {
  const { memos, selectedMemoId, selectMemo, updateMemo, deleteMemo } = useERDStore();
  const memo = memos.find(m => m.id === selectedMemoId);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);

  const memoId = memo?.id;
  const memoText = memo?.text;

  // 선택 메모가 바뀌면 강제 초기화 (조합 상태도 리셋)
  useEffect(() => {
    composingRef.current = false;
    if (taRef.current) taRef.current.value = memoText ?? '';
  }, [memoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 노드 등 외부에서 텍스트가 바뀌면 동기화. 조합 중이거나 값이 같으면 건너뜀.
  useEffect(() => {
    const ta = taRef.current;
    if (!composingRef.current && ta && ta.value !== (memoText ?? '')) {
      ta.value = memoText ?? '';
    }
  }, [memoText]);

  return (
    <aside
      className="w-[320px] shrink-0 bg-surface-container-low border-l border-outline-variant flex flex-col overflow-hidden"
      data-testid="memo-edit-panel"
    >
      {/* Header */}
      <div className="h-12 px-4 border-b border-outline-variant flex items-center justify-between bg-surface-container shrink-0">
        <h3 className="text-[15px] font-semibold text-on-surface m-0 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">sticky_note_2</span>
          Memo
        </h3>
        <div className="flex items-center gap-2">
          {memo && (
            <>
              <button
                className="text-on-surface-variant hover:text-error transition-colors flex items-center cursor-pointer"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: '메모 삭제',
                    message: '이 메모를 삭제할까요?',
                    confirmText: '삭제',
                    danger: true,
                  });
                  if (ok) { deleteMemo(memo.id); selectMemo(null); }
                }}
                title="삭제"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
              <button
                className="text-on-surface-variant hover:text-on-surface transition-colors flex items-center cursor-pointer"
                onClick={() => selectMemo(null)}
                title="닫기"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {!memo ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
          <span className="material-symbols-outlined text-[40px] text-outline-variant">sticky_note_2</span>
          <p className="text-sm text-on-surface-variant m-0">메모를 선택하면 내용을 편집할 수 있습니다</p>
          <p className="text-xs text-outline m-0">캔버스를 더블클릭하거나 Add Memo 버튼으로 메모를 추가하세요</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
          {/* Text */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant opacity-70">내용</label>
            <textarea
              ref={taRef}
              defaultValue={memo.text}
              className="w-full bg-surface-container rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface resize-none outline-none focus:border-primary transition-colors"
              style={{ minHeight: 160 }}
              onChange={e => {
                if (!composingRef.current) updateMemo(memo.id, { text: e.target.value });
              }}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={e => {
                composingRef.current = false;
                updateMemo(memo.id, { text: (e.target as HTMLTextAreaElement).value });
              }}
              onBlur={e => {
                if (composingRef.current) {
                  composingRef.current = false;
                  updateMemo(memo.id, { text: e.target.value });
                }
              }}
              placeholder="메모 내용을 입력하세요..."
            />
          </div>

          {/* Color */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant opacity-70">색상</label>
            <div className="flex gap-2 flex-wrap">
              {MEMO_COLORS.map(c => (
                <button
                  key={c}
                  className="w-8 h-8 rounded-lg cursor-pointer transition-transform hover:scale-110"
                  style={{
                    background: c,
                    border: memo.color === c ? '2.5px solid #6366f1' : '2px solid transparent',
                    boxShadow: memo.color === c ? '0 0 0 1px #6366f1' : 'none',
                  }}
                  onClick={() => updateMemo(memo.id, { color: c })}
                  title={`색상 변경`}
                />
              ))}
            </div>
          </div>

          {/* Size info */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant opacity-70">크기</label>
            <p className="text-xs text-outline m-0">
              {Math.round(memo.width)} × {Math.round(memo.height)} px
              <span className="ml-2 text-on-surface-variant">(캔버스에서 드래그로 조절)</span>
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
