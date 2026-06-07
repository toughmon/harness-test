import { create } from 'zustand';
import { api, DiagramMeta } from '../api/client';
import { useERDStore } from './erdStore';
import { toERDData, fromERDData } from '../utils/erdData';

// DB 다이어그램 메타 상태 — 목록/현재 열린 다이어그램/미저장 변경(dirty) 추적
// erdStore는 수정하지 않고 subscribe로만 변경을 감지한다

interface DiagramState {
  list: DiagramMeta[];
  currentId: number | null;
  dirty: boolean;
  saving: boolean;

  fetchList: () => Promise<void>;
  open: (id: number) => Promise<void>;
  saveCurrent: () => Promise<void>;
  startNew: () => void;
  rename: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  confirmDiscard: () => boolean;
  reset: () => void;
}

// loadData(다이어그램 열기)로 인한 스토어 변경은 dirty로 치지 않는다
let suppressDirty = false;

export const useDiagramStore = create<DiagramState>((set, get) => ({
  list: [],
  currentId: null,
  dirty: false,
  saving: false,

  fetchList: async () => {
    const list = await api.listDiagrams();
    set({ list });
  },

  // 미저장 변경이 있으면 사용자 확인 — true면 진행
  confirmDiscard: () => {
    if (!get().dirty) return true;
    return window.confirm('저장하지 않은 변경사항이 있습니다. 계속할까요?');
  },

  open: async (id) => {
    if (!get().confirmDiscard()) return;
    const diagram = await api.getDiagram(id);
    const { entities, relationships, positions } = fromERDData(diagram.data);
    suppressDirty = true;
    useERDStore.getState().loadData(entities, relationships, positions);
    suppressDirty = false;
    set({ currentId: id, dirty: false });
  },

  saveCurrent: async () => {
    const { currentId, saving } = get();
    if (saving) return;
    const { entities, relationships, nodePositions } = useERDStore.getState();
    const data = toERDData(entities, relationships, nodePositions);
    set({ saving: true });
    try {
      if (currentId !== null) {
        await api.updateDiagram(currentId, data);
      } else {
        const name = window.prompt('다이어그램 이름을 입력하세요', '새 다이어그램');
        if (!name?.trim()) return;
        const created = await api.createDiagram(name.trim(), data);
        set({ currentId: created.id });
      }
      set({ dirty: false });
      await get().fetchList();
    } catch (err) {
      alert(`저장 실패: ${(err as Error).message}`);
    } finally {
      set({ saving: false });
    }
  },

  // 빈 캔버스에서 새로 시작 — 저장은 DB 저장 버튼에서 이름 입력으로
  startNew: () => {
    if (!get().confirmDiscard()) return;
    suppressDirty = true;
    useERDStore.getState().loadData([], [], {});
    suppressDirty = false;
    set({ currentId: null, dirty: false });
  },

  rename: async (id) => {
    const current = get().list.find(d => d.id === id);
    const name = window.prompt('새 이름을 입력하세요', current?.name ?? '');
    if (!name?.trim()) return;
    await api.renameDiagram(id, name.trim());
    await get().fetchList();
  },

  remove: async (id) => {
    if (!window.confirm('이 다이어그램을 삭제할까요? 되돌릴 수 없습니다.')) return;
    await api.deleteDiagram(id);
    if (get().currentId === id) set({ currentId: null });
    await get().fetchList();
  },

  reset: () => set({ list: [], currentId: null, dirty: false, saving: false }),
}));

// erdStore 데이터 변경 감지 → dirty 마킹 (undo/redo 포함 모든 변경 포착)
useERDStore.subscribe((state, prev) => {
  if (suppressDirty) return;
  if (
    state.entities !== prev.entities ||
    state.relationships !== prev.relationships ||
    state.nodePositions !== prev.nodePositions
  ) {
    const dg = useDiagramStore.getState();
    if (!dg.dirty) useDiagramStore.setState({ dirty: true });
  }
});
