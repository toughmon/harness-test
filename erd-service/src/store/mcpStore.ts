import { create } from 'zustand';

// MCP 연결 모달 열림 상태만 관리 — 토큰 데이터는 모달 컴포넌트의 로컬 상태에서 처리
interface McpState {
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

export const useMcpStore = create<McpState>((set) => ({
  modalOpen: false,
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
}));
