import { create } from 'zustand';

// 공유 모달 열림 상태만 관리 — 링크 데이터는 모달 컴포넌트의 로컬 상태에서 처리(McpConnectModal과 동일 패턴).
// 모달은 현재 열린 다이어그램(diagramStore.currentId)을 대상으로 동작한다.
interface ShareState {
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

export const useShareStore = create<ShareState>((set) => ({
  modalOpen: false,
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
}));
