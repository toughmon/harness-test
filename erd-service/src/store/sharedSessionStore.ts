import { create } from 'zustand';
import { api, ApiError, type ShareRole } from '../api/client';
import { fromERDData } from '../utils/erdData';
import { useERDStore } from './erdStore';
import { useCollabStore } from './collabStore';
import { useAuthStore } from './authStore';

// 공유 링크로 연 세션(뷰어/편집자) — 소유자의 "내 다이어그램" 흐름과 분리된 별도 진입 경로.
// /d/:token(또는 ?share=)로 들어오면 enter()가 다이어그램을 읽어 로드하고 협업 룸에 연결한다.
// 읽기 전용 여부·역할 표시는 collabStore/erdStore.readOnly가 최종 판단(서버 init 프레임 기준).

interface SharedSessionState {
  token: string | null;
  diagramId: number | null;
  name: string | null;
  role: ShareRole | 'owner' | null;
  error: string | null;
  needsLogin: boolean;
  enter: (token: string) => Promise<void>;
  leave: () => void;
}

export const useSharedSessionStore = create<SharedSessionState>((set) => ({
  token: null,
  diagramId: null,
  name: null,
  role: null,
  error: null,
  needsLogin: false,

  enter: async (token) => {
    set({ token, error: null, needsLogin: false });
    // MVP: 로그인 필요 — 비로그인 상태면 로그인 모달을 띄우고, 로그인 후 App에서 재시도한다.
    if (useAuthStore.getState().status === 'anon') {
      set({ needsLogin: true });
      useAuthStore.getState().openModal();
      return;
    }
    try {
      const dg = await api.getSharedDiagram(token);
      const { entities, relationships, positions, memos } = fromERDData(dg.data);
      useERDStore.getState().loadData(entities, relationships, positions, memos);
      set({ diagramId: dg.id, name: dg.name, role: dg.role, needsLogin: false });
      // 협업 룸 연결 — 서버가 토큰으로 역할(viewer/editor)을 판정, readOnly는 collabStore가 설정
      useCollabStore.getState().connect(dg.id, token);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        set({ needsLogin: true });
        useAuthStore.getState().openModal();
      } else {
        set({ error: '만료되었거나 유효하지 않은 공유 링크입니다.' });
      }
    }
  },

  leave: () => {
    useCollabStore.getState().disconnect();
    set({ token: null, diagramId: null, name: null, role: null, error: null, needsLogin: false });
  },
}));
