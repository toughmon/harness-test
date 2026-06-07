import { useEffect, useState } from 'react';
import { useDialogStore } from '../../store/dialogStore';

// 공용 알림/확인/입력 모달 — RelTypeModal·AuthModal과 동일한 오버레이 패턴

export default function DialogModal() {
  const { dialog, close } = useDialogStore();
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(dialog?.kind === 'prompt' ? (dialog.defaultValue ?? '') : '');
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  if (!dialog) return null;

  const cancel = () => {
    if (dialog.kind === 'alert') dialog.resolve();
    else if (dialog.kind === 'confirm') dialog.resolve(false);
    else dialog.resolve(null);
    close();
  };

  const ok = () => {
    if (dialog.kind === 'alert') dialog.resolve();
    else if (dialog.kind === 'confirm') dialog.resolve(true);
    else {
      if (!value.trim()) return; // 빈 입력은 확인 불가
      dialog.resolve(value.trim());
    }
    close();
  };

  const icon = dialog.kind === 'alert' ? 'info' : dialog.kind === 'confirm' ? (dialog.danger ? 'warning' : 'help') : 'edit';
  const iconColor = dialog.kind === 'confirm' && dialog.danger ? 'text-red-400' : 'text-primary';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={cancel}
      data-testid="app-dialog"
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden w-80 bg-surface-container border border-outline-variant"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-outline-variant flex items-center gap-2">
          <span className={`material-symbols-outlined text-[18px] ${iconColor}`}>{icon}</span>
          <h3 className="text-sm font-semibold text-on-surface m-0">{dialog.title}</h3>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-on-surface-variant m-0 whitespace-pre-line">{dialog.message}</p>

          {dialog.kind === 'prompt' && (
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') ok(); }}
              placeholder={dialog.placeholder}
              autoFocus
              data-testid="dialog-input"
              className="bg-surface border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:border-primary outline-none"
            />
          )}

          <div className="flex gap-2 justify-end">
            {dialog.kind !== 'alert' && (
              <button
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                onClick={cancel}
                data-testid="dialog-cancel"
              >
                취소
              </button>
            )}
            <button
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer active:scale-[0.98] disabled:opacity-40 ${
                dialog.kind === 'confirm' && dialog.danger
                  ? 'bg-red-500/90 text-white hover:bg-red-500'
                  : 'bg-primary text-on-primary hover:bg-inverse-primary hover:text-white'
              }`}
              onClick={ok}
              disabled={dialog.kind === 'prompt' && !value.trim()}
              data-testid="dialog-ok"
            >
              {dialog.kind === 'confirm' ? (dialog.confirmText ?? '확인') : '확인'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
