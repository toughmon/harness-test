import { useRef, useEffect } from 'react';
import { useERDStore } from '../../store/erdStore';
import { MEMO_COLORS } from '../../types/erd';
import { confirmDialog } from '../../store/dialogStore';
import EditorModal from '../common/EditorModal';

// 메모 편집 모달 — 우클릭 "편집"으로 연다 (editorOpen === 'memo').
// 노드 내 인라인 textarea 편집은 그대로 유지되고, 이 모달은 색상·삭제 등 추가 편집을 제공.
export default function MemoEditPanel() {
  const { memos, selectedMemoId, editorOpen, closeEditor, updateMemo, deleteMemo, selectMemo } = useERDStore();
  const memo = memos.find(m => m.id === selectedMemoId);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const focusedRef = useRef(false);

  const memoId = memo?.id;
  const memoText = memo?.text;

  // 선택한 메모가 바뀌면 textarea를 그 메모 내용으로 초기화 (포커스 무관 — 다른 메모로 전환된 것).
  useEffect(() => {
    if (taRef.current) taRef.current.value = memoText ?? '';
    // memoText는 의도적으로 deps에서 제외 — id 전환 시에만 강제 초기화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoId]);

  // 다른 곳(캔버스 노드)에서 텍스트가 바뀌면 모달에 반영. 단, 모달 textarea에 포커스가 있으면 건드리지 않음.
  useEffect(() => {
    const ta = taRef.current;
    if (ta && !focusedRef.current && ta.value !== (memoText ?? '')) {
      ta.value = memoText ?? '';
    }
  }, [memoText]);

  if (editorOpen !== 'memo' || !memo) return null;

  return (
    <EditorModal
      title="Memo"
      icon="sticky_note_2"
      onClose={closeEditor}
      testId="memo-edit-panel"
      headerActions={
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
          data-testid="memo-editor-delete"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      }
    >
      <div className="p-4 flex flex-col gap-4">
        {/* Text */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant opacity-70">내용</label>
          <textarea
            ref={taRef}
            defaultValue={memo.text}
            className="w-full bg-surface-container rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface resize-none outline-none focus:border-primary transition-colors"
            style={{ minHeight: 160 }}
            onFocus={() => { focusedRef.current = true; }}
            onBlur={e => { focusedRef.current = false; updateMemo(memo.id, { text: e.target.value }); }}
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
    </EditorModal>
  );
}
