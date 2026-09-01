import { useEffect, ReactNode } from 'react';
import { useDialogStore } from '../../store/dialogStore';
import { useT } from '../../i18n';

// 공용 편집 모달 — 우측 고정 패널(Entity/Relationship/Memo)을 대체하는 컨테이너.
// DialogModal·RelTypeModal과 동일한 오버레이 패턴(fixed inset-0 bg-black/60 + 중앙 카드)을 재사용.
interface EditorModalProps {
  title: string;
  icon?: string;
  onClose: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
  testId?: string;
}

export default function EditorModal({ title, icon, onClose, headerActions, children, testId }: EditorModalProps) {
  const t = useT();
  // 삭제 확인(DialogModal)이 이 모달 위에 뜬 상태에선 Escape가 확인창을 닫도록 양보한다.
  const dialogOpen = useDialogStore(s => !!s.dialog);

  useEffect(() => {
    if (dialogOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, dialogOpen]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      data-testid={testId ?? 'editor-modal'}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden w-full max-w-[640px] max-h-[85vh] flex flex-col bg-surface-container-low border border-outline-variant"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-12 px-4 border-b border-outline-variant flex items-center justify-between bg-surface-container shrink-0">
          <h3 className="text-[15px] font-semibold text-on-surface m-0 flex items-center gap-2 min-w-0">
            {icon && <span className="material-symbols-outlined text-[18px] shrink-0">{icon}</span>}
            <span className="truncate">{title}</span>
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <button
              className="text-on-surface-variant hover:text-on-surface text-lg leading-none cursor-pointer"
              onClick={onClose}
              title={t('common.close')}
              data-testid="editor-modal-close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
