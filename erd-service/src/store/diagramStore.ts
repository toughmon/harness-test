import { create } from 'zustand';
import { api, DiagramMeta } from '../api/client';
import { useERDStore } from './erdStore';
import { useCollabStore } from './collabStore';
import { toERDData, fromERDData } from '../utils/erdData';
import { alertDialog, confirmDialog, promptDialog } from './dialogStore';
import { getT, type TFunc } from '../i18n';
import { errorMessage } from '../i18n/errors';

// 스토어는 React 밖이라 훅을 못 쓴다 — 호출 시점의 로케일로 번역한다
const t: TFunc = (key, params) => getT()(key, params);

// DB 다이어그램 메타 상태 — 목록/현재 열린 다이어그램/미저장 변경(dirty) 추적
// erdStore는 수정하지 않고 subscribe로만 변경을 감지한다

const LAST_DIAGRAM_KEY = 'erd_last_diagram_id';

function saveLastId(id: number | null) {
  if (id === null) localStorage.removeItem(LAST_DIAGRAM_KEY);
  else localStorage.setItem(LAST_DIAGRAM_KEY, String(id));
}

function loadLastId(): number | null {
  const v = localStorage.getItem(LAST_DIAGRAM_KEY);
  return v ? Number(v) : null;
}

interface DiagramState {
  list: DiagramMeta[];
  currentId: number | null;
  dirty: boolean;
  saving: boolean;

  fetchList: () => Promise<void>;
  open: (id: number) => Promise<void>;
  saveCurrent: () => Promise<void>;
  autoSave: () => Promise<void>;
  startNew: () => Promise<void>;
  rename: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  duplicate: (id: number) => Promise<void>;
  confirmDiscard: () => Promise<boolean>;
  reset: () => void;
  restoreLastOpened: () => Promise<void>;
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
  confirmDiscard: async () => {
    if (!get().dirty) return true;
    return confirmDialog({
      title: t('diagram.unsavedTitle'),
      message: t('diagram.unsavedMessage'),
      confirmText: t('diagram.continue'),
      danger: true,
    });
  },

  open: async (id) => {
    if (!(await get().confirmDiscard())) return;
    // 다른 다이어그램/공유 세션을 열고 있었다면 협업 연결을 끊는다(readOnly도 해제됨)
    useCollabStore.getState().disconnect();
    const diagram = await api.getDiagram(id);
    const { entities, relationships, positions, memos } = fromERDData(diagram.data);
    suppressDirty = true;
    useERDStore.getState().loadData(entities, relationships, positions, memos);
    suppressDirty = false;
    set({ currentId: id, dirty: false });
    saveLastId(id);
  },

  saveCurrent: async () => {
    const { currentId, saving } = get();
    if (saving) return;
    const { entities, relationships, nodePositions, memos } = useERDStore.getState();
    const data = toERDData(entities, relationships, nodePositions, memos);
    set({ saving: true });
    try {
      if (currentId !== null) {
        await api.updateDiagram(currentId, data);
      } else {
        const name = await promptDialog({
          title: t('diagram.saveTitle'),
          message: t('diagram.savePrompt'),
          defaultValue: t('diagram.defaultName'),
          placeholder: t('diagram.namePlaceholder'),
        });
        if (!name) return;
        const created = await api.createDiagram(name, data);
        set({ currentId: created.id });
        saveLastId(created.id);
      }
      set({ dirty: false });
      await get().fetchList();
    } catch (err) {
      alertDialog(`${t('diagram.saveFailed')}\n${errorMessage(err)}`, t('diagram.saveFailedTitle'));
    } finally {
      set({ saving: false });
    }
  },

  // 5초 자동 저장용 — currentId가 없는 새 다이어그램은 건너뜀(이름 입력 불필요)
  autoSave: async () => {
    const { currentId, dirty, saving } = get();
    if (!dirty || currentId === null || saving) return;
    const { entities, relationships, nodePositions, memos } = useERDStore.getState();
    const data = toERDData(entities, relationships, nodePositions, memos);
    set({ saving: true });
    try {
      await api.updateDiagram(currentId, data);
      set({ dirty: false });
    } catch {
      // 자동 저장 실패는 조용히 무시 — 다음 인터벌에 재시도
    } finally {
      set({ saving: false });
    }
  },

  // 빈 캔버스에서 새로 시작 — 저장은 DB 저장 버튼에서 이름 입력으로
  startNew: async () => {
    if (!(await get().confirmDiscard())) return;
    useCollabStore.getState().disconnect();
    suppressDirty = true;
    useERDStore.getState().loadData([], [], {}, []);
    suppressDirty = false;
    set({ currentId: null, dirty: false });
    saveLastId(null);
  },

  rename: async (id) => {
    const current = get().list.find(d => d.id === id);
    const name = await promptDialog({
      title: t('diagram.renameTitle'),
      message: t('diagram.renamePrompt'),
      defaultValue: current?.name ?? '',
    });
    if (!name) return;
    await api.renameDiagram(id, name);
    await get().fetchList();
  },

  duplicate: async (id) => {
    const current = get().list.find(d => d.id === id);
    const name = await promptDialog({
      title: t('diagram.duplicateTitle'),
      message: t('diagram.duplicatePrompt'),
      defaultValue: current ? t('diagram.copyOf', { name: current.name }) : t('diagram.copyDefault'),
    });
    if (!name) return;
    try {
      const diagram = await api.getDiagram(id);
      await api.createDiagram(name, diagram.data);
      await get().fetchList();
    } catch (err) {
      alertDialog(`${t('diagram.duplicateFailed')}\n${errorMessage(err)}`, t('diagram.duplicateFailedTitle'));
    }
  },

  remove: async (id) => {
    const current = get().list.find(d => d.id === id);
    const ok = await confirmDialog({
      title: t('diagram.deleteTitle'),
      message: t('diagram.deleteMessage', { name: current?.name ?? '' }),
      confirmText: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await api.deleteDiagram(id);
    if (get().currentId === id) {
      set({ currentId: null });
      saveLastId(null);
    }
    await get().fetchList();
  },

  reset: () => {
    useCollabStore.getState().disconnect();
    saveLastId(null);
    set({ list: [], currentId: null, dirty: false, saving: false });
  },

  restoreLastOpened: async () => {
    const lastId = loadLastId();
    if (lastId === null) return;
    const { list } = get();
    if (list.find(d => d.id === lastId)) {
      await get().open(lastId);
    } else {
      saveLastId(null);
    }
  },
}));

// erdStore 데이터 변경 감지 → dirty 마킹 (undo/redo 포함 모든 변경 포착)
useERDStore.subscribe((state, prev) => {
  if (suppressDirty) return;
  if (
    state.entities !== prev.entities ||
    state.relationships !== prev.relationships ||
    state.nodePositions !== prev.nodePositions ||
    state.memos !== prev.memos
  ) {
    const dg = useDiagramStore.getState();
    if (!dg.dirty) useDiagramStore.setState({ dirty: true });
  }
});
