import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';

// 엔티티·관계선·메모 공용 우클릭 컨텍스트 메뉴 — 편집/삭제 진입점.
interface ContextMenuProps {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ContextMenu({ x, y, onEdit, onDelete, onClose }: ContextMenuProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  // 뷰포트 밖으로 나가지 않도록 위치 보정 (렌더 후 실제 크기 기준)
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY) });
    // x/y 변경 시(새 메뉴 오픈)에만 재계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

  useEffect(() => {
    const onDocClick = () => onClose();
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('click', onDocClick);
    window.addEventListener('contextmenu', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('contextmenu', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[70] min-w-[140px] rounded-lg shadow-2xl border border-outline-variant bg-surface-container overflow-hidden py-1"
      style={{ left: pos.x, top: pos.y }}
      data-testid="context-menu"
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      <button
        className="w-full text-left px-3 py-2 text-xs text-on-surface hover:bg-surface-variant flex items-center gap-2 cursor-pointer"
        onClick={() => { onClose(); onEdit(); }}
        data-testid="context-menu-edit"
      >
        <span className="material-symbols-outlined text-[15px]">edit</span> {t('common.edit')}
      </button>
      <button
        className="w-full text-left px-3 py-2 text-xs text-error hover:bg-error-container/30 flex items-center gap-2 cursor-pointer"
        onClick={() => { onClose(); onDelete(); }}
        data-testid="context-menu-delete"
      >
        <span className="material-symbols-outlined text-[15px]">delete</span> {t('common.delete')}
      </button>
    </div>
  );
}
