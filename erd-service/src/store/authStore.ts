import { create } from 'zustand';
import { api, User } from '../api/client';
import { useDiagramStore } from './diagramStore';

// 인증 상태 — erdStore와 완전 분리. 비로그인 시 기존 동작에 영향 없음

interface AuthState {
  user: User | null;
  status: 'loading' | 'authed' | 'anon';
  modalOpen: boolean;

  init: (skipRestore?: boolean) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
}

let initStarted = false; // StrictMode 이중 마운트 가드

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  modalOpen: false,

  init: async (skipRestore) => {
    if (initStarted) return;
    initStarted = true;
    try {
      const user = await api.me();
      set({ user, status: 'authed' });
      await useDiagramStore.getState().fetchList();
      // 공유 링크로 진입한 경우(skipRestore) 내 마지막 다이어그램 복원을 건너뛴다(공유 다이어그램이 우선).
      if (!skipRestore) await useDiagramStore.getState().restoreLastOpened();
    } catch {
      set({ user: null, status: 'anon' });
    }
  },

  login: async (username, password) => {
    const user = await api.login(username, password);
    set({ user, status: 'authed', modalOpen: false });
    useDiagramStore.getState().fetchList();
  },

  register: async (username, password) => {
    const user = await api.register(username, password);
    set({ user, status: 'authed', modalOpen: false });
    useDiagramStore.getState().fetchList();
  },

  logout: async () => {
    if (!(await useDiagramStore.getState().confirmDiscard())) return;
    try {
      await api.logout();
    } finally {
      set({ user: null, status: 'anon' });
      useDiagramStore.getState().reset();
    }
  },

  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
}));
