import { create } from 'zustand';

// 공용 다이얼로그 — window.alert/confirm/prompt 대체 (Promise 기반)

interface AlertOptions {
  title?: string;
  message: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  danger?: boolean; // 삭제 등 파괴적 동작 — 확인 버튼 빨간색
}

interface PromptOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
}

export type DialogState =
  | ({ kind: 'alert'; resolve: () => void } & AlertOptions)
  | ({ kind: 'confirm'; resolve: (ok: boolean) => void } & ConfirmOptions)
  | ({ kind: 'prompt'; resolve: (value: string | null) => void } & PromptOptions);

interface DialogStore {
  dialog: DialogState | null;
  show: (dialog: DialogState) => void;
  close: () => void;
}

export const useDialogStore = create<DialogStore>((set) => ({
  dialog: null,
  show: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));

export function alertDialog(message: string, title = '알림'): Promise<void> {
  return new Promise((resolve) => {
    useDialogStore.getState().show({ kind: 'alert', message, title, resolve });
  });
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().show({ kind: 'confirm', title: '확인', ...options, resolve });
  });
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().show({ kind: 'prompt', title: '입력', ...options, resolve });
  });
}
