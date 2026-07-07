import { create } from 'zustand';
import { Entity, Column, Memo, Relationship, RelationshipType, Subtype, EndpointAnchor } from '../types/erd';
import * as erdOps from '../core/erdOps';
import { genId, DEFAULT_COLUMN, type NodePosition, type ErdDoc } from '../core/erdOps';
import type { RelationshipSides } from '../core/relationshipSides';

// 변형 로직은 ../core/erdOps(순수 함수, MCP 서버와 공유)에 있고, 여기서는 히스토리·
// 선택 상태·dirty 추적 같은 UI 관심사만 감싼다. erdOps.fn(docOf(s), ...)을 호출해 결과
// 문서를 set으로 머지한다. 서브타입/위치/undo·redo/loadData는 UI 전용이라 인라인 유지.

// Undo/Redo용 문서 상태 스냅샷 (선택 상태는 제외)
interface Snapshot {
  entities: Entity[];
  relationships: Relationship[];
  nodePositions: Record<string, NodePosition>;
  memos: Memo[];
}

const HISTORY_LIMIT = 50;
// 같은 대상 연속 편집(키 입력 등)은 이 시간 내 병합되어 스냅샷 1개만 남긴다
const COALESCE_MS = 800;

// 스토어 상태에서 erdOps가 다루는 문서 슬라이스만 추출
const docOf = (s: { entities: Entity[]; relationships: Relationship[]; nodePositions: Record<string, NodePosition>; memos: Memo[] }): ErdDoc => ({
  entities: s.entities,
  relationships: s.relationships,
  nodePositions: s.nodePositions,
  memos: s.memos,
});

interface ERDStore {
  entities: Entity[];
  relationships: Relationship[];
  nodePositions: Record<string, NodePosition>;
  memos: Memo[];
  selectedEntityId: string | null;
  selectedEdgeId: string | null;
  selectedMemoId: string | null;
  editorOpen: 'entity' | 'relationship' | 'memo' | null;
  pendingConnection: { sourceId: string; sourceHandle: string } | null;

  past: Snapshot[];
  future: Snapshot[];
  undo: () => void;
  redo: () => void;

  addEntity: () => void;
  updateEntity: (id: string, updates: Partial<Omit<Entity, 'id' | 'columns'>>) => void;
  deleteEntity: (id: string) => void;
  selectEntity: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  selectMemo: (id: string | null) => void;
  openEntityEditor: (id: string) => void;
  openRelationshipEditor: (id: string) => void;
  openMemoEditor: (id: string) => void;
  closeEditor: () => void;

  addMemo: (pos?: { x: number; y: number }) => void;
  updateMemo: (id: string, updates: Partial<Omit<Memo, 'id'>>) => void;
  deleteMemo: (id: string) => void;
  updateMemoPosition: (id: string, x: number, y: number) => void;
  updateMemoSize: (id: string, w: number, h: number) => void;

  addColumn: (entityId: string) => void;
  updateColumn: (entityId: string, columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (entityId: string, columnId: string) => void;
  moveColumn: (entityId: string, fromIdx: number, toIdx: number) => void;

  // 배타적 서브타입(SubSet)
  addSubtype: (entityId: string) => void;
  removeSubtype: (entityId: string, subtypeId: string) => void;
  updateSubtype: (entityId: string, subtypeId: string, updates: Partial<Pick<Subtype, 'name' | 'logicalName'>>) => void;
  updateSubsetMeta: (entityId: string, updates: Partial<Pick<Entity, 'subsetName' | 'subtypeExclusive' | 'subtypeComplete'>>) => void;
  addSubtypeColumn: (entityId: string, subtypeId: string) => void;
  updateSubtypeColumn: (entityId: string, subtypeId: string, columnId: string, updates: Partial<Column>) => void;
  deleteSubtypeColumn: (entityId: string, subtypeId: string, columnId: string) => void;

  addRelationship: (sourceId: string, targetId: string, type: RelationshipType) => void;
  updateRelationshipType: (id: string, type: RelationshipType) => void;
  updateRelationshipSides: (id: string, partial: Partial<RelationshipSides>) => void;
  updateRelationshipAnchor: (id: string, end: 'source' | 'target', anchor: EndpointAnchor | null) => void;
  deleteRelationship: (id: string) => void;

  updateNodePosition: (id: string, pos: NodePosition) => void;
  setAllPositions: (positions: Record<string, NodePosition>) => void;
  setPendingConnection: (val: ERDStore['pendingConnection']) => void;

  loadData: (entities: Entity[], relationships: Relationship[], positions: Record<string, NodePosition>, memos?: Memo[]) => void;
}

export const useERDStore = create<ERDStore>((set, get) => {
  // ---- Undo/Redo 내부 상태 ----
  let lastActionKey = '';
  let lastActionTime = 0;

  const takeSnapshot = (): Snapshot => {
    const s = get();
    return {
      entities: s.entities,
      relationships: s.relationships,
      nodePositions: s.nodePositions,
      memos: s.memos,
    };
  };

  // 변경 직전에 호출 — 같은 key의 연속 호출은 COALESCE_MS 내 병합
  const pushHistory = (key: string) => {
    const now = Date.now();
    if (key === lastActionKey && now - lastActionTime < COALESCE_MS) {
      lastActionTime = now;
      return;
    }
    lastActionKey = key;
    lastActionTime = now;
    set(s => ({
      past: [...s.past.slice(-(HISTORY_LIMIT - 1)), takeSnapshot()],
      future: [],
    }));
  };

  return {
    entities: [],
    relationships: [],
    nodePositions: {},
    memos: [],
    selectedEntityId: null,
    selectedEdgeId: null,
    selectedMemoId: null,
    editorOpen: null,
    pendingConnection: null,

    past: [],
    future: [],

    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      lastActionKey = '';
      set({
        ...prev,
        past: s.past.slice(0, -1),
        future: [takeSnapshot(), ...s.future].slice(0, HISTORY_LIMIT),
      });
    },

    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      lastActionKey = '';
      set({
        ...next,
        past: [...s.past.slice(-(HISTORY_LIMIT - 1)), takeSnapshot()],
        future: s.future.slice(1),
      });
    },

    addEntity: () => {
      pushHistory('addEntity');
      set(s => {
        const { doc, entityId } = erdOps.addEntity(docOf(s));
        return { ...doc, selectedEntityId: entityId };
      });
    },

    updateEntity: (id, updates) => {
      pushHistory(`updateEntity:${id}:${Object.keys(updates).join(',')}`);
      set(s => erdOps.updateEntity(docOf(s), id, updates));
    },

    deleteEntity: (id) => {
      pushHistory('deleteEntity');
      set(s => {
        const doc = erdOps.deleteEntity(docOf(s), id);
        return {
          ...doc,
          selectedEntityId: s.selectedEntityId === id ? null : s.selectedEntityId,
          // 삭제로 사라진 관계를 선택 중이었다면 엣지 선택 해제
          selectedEdgeId: doc.relationships.some(r => r.id === s.selectedEdgeId) ? s.selectedEdgeId : null,
          // 삭제된 엔티티의 편집 모달이 열려 있었다면 같이 닫는다 (남겨두면 이후 다른 엔티티를 선택할 때 잘못 재오픈됨)
          editorOpen: (s.editorOpen === 'entity' && s.selectedEntityId === id) ? null : s.editorOpen,
        };
      });
    },

    // 엔티티/엣지/메모 "선택"(하이라이트)만 한다 — 편집 모달은 openXEditor로 별도 오픈.
    // editorOpen은 여기서 건드리지 않는다: 캔버스는 모달이 열려 있으면 클릭이 막히므로 정상 사용
    // 경로로는 절대 동시에 안 일어나지만, 모달 뒤에 가려진 메모 textarea가 onFocus에서 selectMemo를
    // 호출하는 경우처럼 클릭이 아닌 경로로 선택이 트리거될 수 있어 — 거기서 모달을 닫아버리면 안 된다.
    // 삭제로 편집 대상이 사라져 editorOpen이 stale해지는 경우는 각 deleteX 액션에서 정리한다.
    selectEntity: (id) => set({ selectedEntityId: id, selectedEdgeId: null, selectedMemoId: null }),
    selectEdge: (id) => set({ selectedEdgeId: id, selectedEntityId: null, selectedMemoId: null }),
    selectMemo: (id) => set({ selectedMemoId: id, selectedEntityId: null, selectedEdgeId: null }),

    // 편집 모달 트리거 — info 아이콘 클릭 / ✎ 아이콘 클릭 / 우클릭 컨텍스트 메뉴 "편집"에서 호출
    openEntityEditor: (id) => set({ selectedEntityId: id, selectedEdgeId: null, selectedMemoId: null, editorOpen: 'entity' }),
    openRelationshipEditor: (id) => set({ selectedEdgeId: id, selectedEntityId: null, selectedMemoId: null, editorOpen: 'relationship' }),
    openMemoEditor: (id) => set({ selectedMemoId: id, selectedEntityId: null, selectedEdgeId: null, editorOpen: 'memo' }),
    closeEditor: () => set({ editorOpen: null }),

    addMemo: (pos) => {
      pushHistory('addMemo');
      set(s => {
        const { doc, memoId } = erdOps.addMemo(docOf(s), pos ?? { x: 200, y: 200 });
        return { ...doc, selectedMemoId: memoId, selectedEntityId: null, selectedEdgeId: null };
      });
    },

    updateMemo: (id, updates) => {
      pushHistory(`updateMemo:${id}:${Object.keys(updates).join(',')}`);
      set(s => erdOps.updateMemo(docOf(s), id, updates));
    },

    deleteMemo: (id) => {
      pushHistory('deleteMemo');
      set(s => ({
        ...erdOps.deleteMemo(docOf(s), id),
        selectedMemoId: s.selectedMemoId === id ? null : s.selectedMemoId,
        editorOpen: (s.editorOpen === 'memo' && s.selectedMemoId === id) ? null : s.editorOpen,
      }));
    },

    updateMemoPosition: (id, x, y) => {
      pushHistory(`moveMemo:${id}`);
      set(s => erdOps.updateMemo(docOf(s), id, { x, y }));
    },

    updateMemoSize: (id, w, h) => {
      pushHistory(`resizeMemo:${id}`);
      set(s => erdOps.updateMemo(docOf(s), id, { width: w, height: h }));
    },

    addColumn: (entityId) => {
      pushHistory('addColumn');
      set(s => erdOps.addColumn(docOf(s), entityId).doc);
    },

    updateColumn: (entityId, columnId, updates) => {
      pushHistory(`updateColumn:${columnId}:${Object.keys(updates).join(',')}`);
      set(s => erdOps.updateColumn(docOf(s), entityId, columnId, updates));
    },

    deleteColumn: (entityId, columnId) => {
      pushHistory('deleteColumn');
      set(s => erdOps.deleteColumn(docOf(s), entityId, columnId));
    },

    moveColumn: (entityId, fromIdx, toIdx) => {
      pushHistory('moveColumn');
      set(s => erdOps.moveColumn(docOf(s), entityId, fromIdx, toIdx));
    },

    // ── 배타적 서브타입(SubSet) — UI 전용, 인라인 유지 ──
    addSubtype: (entityId) => {
      pushHistory('addSubtype');
      set(s => ({
        entities: s.entities.map(e => {
          if (e.id !== entityId) return e;
          const subtypes = e.subtypes ?? [];
          const newSub: Subtype = {
            id: genId(),
            name: `SubType${subtypes.length + 1}`,
            logicalName: '',
            columns: [],
          };
          return {
            ...e,
            // 첫 서브타입 추가 시 그룹 기본값 세팅 (배타·불완전)
            subsetName: e.subsetName ?? 'SubSet',
            subtypeExclusive: e.subtypeExclusive ?? true,
            subtypeComplete: e.subtypeComplete ?? false,
            subtypes: [...subtypes, newSub],
          };
        }),
      }));
    },

    removeSubtype: (entityId, subtypeId) => {
      pushHistory('removeSubtype');
      set(s => ({
        entities: s.entities.map(e =>
          e.id === entityId
            ? { ...e, subtypes: (e.subtypes ?? []).filter(st => st.id !== subtypeId) }
            : e
        ),
      }));
    },

    updateSubtype: (entityId, subtypeId, updates) => {
      pushHistory(`updateSubtype:${subtypeId}:${Object.keys(updates).join(',')}`);
      set(s => ({
        entities: s.entities.map(e =>
          e.id === entityId
            ? { ...e, subtypes: (e.subtypes ?? []).map(st => st.id === subtypeId ? { ...st, ...updates } : st) }
            : e
        ),
      }));
    },

    updateSubsetMeta: (entityId, updates) => {
      pushHistory(`subsetMeta:${entityId}:${Object.keys(updates).join(',')}`);
      set(s => ({
        entities: s.entities.map(e => e.id === entityId ? { ...e, ...updates } : e),
      }));
    },

    addSubtypeColumn: (entityId, subtypeId) => {
      pushHistory('addSubtypeColumn');
      const newCol: Column = { ...DEFAULT_COLUMN, id: genId(), name: 'column' };
      set(s => ({
        entities: s.entities.map(e =>
          e.id === entityId
            ? { ...e, subtypes: (e.subtypes ?? []).map(st => st.id === subtypeId ? { ...st, columns: [...st.columns, newCol] } : st) }
            : e
        ),
      }));
    },

    updateSubtypeColumn: (entityId, subtypeId, columnId, updates) => {
      pushHistory(`updateSubtypeColumn:${columnId}:${Object.keys(updates).join(',')}`);
      set(s => ({
        entities: s.entities.map(e =>
          e.id === entityId
            ? {
                ...e,
                subtypes: (e.subtypes ?? []).map(st =>
                  st.id === subtypeId
                    ? { ...st, columns: st.columns.map(c => c.id === columnId ? { ...c, ...updates } : c) }
                    : st
                ),
              }
            : e
        ),
      }));
    },

    deleteSubtypeColumn: (entityId, subtypeId, columnId) => {
      pushHistory('deleteSubtypeColumn');
      set(s => ({
        entities: s.entities.map(e =>
          e.id === entityId
            ? {
                ...e,
                subtypes: (e.subtypes ?? []).map(st =>
                  st.id === subtypeId ? { ...st, columns: st.columns.filter(c => c.id !== columnId) } : st
                ),
              }
            : e
        ),
      }));
    },

    addRelationship: (sourceId, targetId, type) => {
      const { entities } = get();
      // 엔티티가 모두 존재할 때만 히스토리를 남긴다 (erdOps도 동일하게 no-op 처리)
      if (!entities.find(e => e.id === targetId) || !entities.find(e => e.id === sourceId)) return;
      pushHistory('addRelationship');
      set(s => erdOps.addRelationship(docOf(s), sourceId, targetId, type).doc);
    },

    updateRelationshipType: (id, newType) => {
      const s = get();
      const rel = s.relationships.find(r => r.id === id);
      if (!rel || rel.type === newType) return;
      if (!s.entities.find(e => e.id === rel.sourceId)) return;
      pushHistory(`relType:${id}`);
      set(st => erdOps.updateRelationshipType(docOf(st), id, newType).doc);
    },

    // 관계선 좌/우 절반 속성 부분 갱신 (FK 플래그 동반 갱신, undo 지원)
    updateRelationshipSides: (id, partial) => {
      const s = get();
      const rel = s.relationships.find(r => r.id === id);
      if (!rel) return;
      if (!s.entities.find(e => e.id === rel.sourceId)) return;
      pushHistory(`relSides:${id}`);
      set(st => erdOps.updateRelationshipSides(docOf(st), id, partial).doc);
    },

    // 관계선 끝점 수동 부착 위치 (드래그 종료 시 1회 커밋, undo 지원). anchor=null이면 자동 복귀.
    updateRelationshipAnchor: (id, end, anchor) => {
      const s = get();
      if (!s.relationships.find(r => r.id === id)) return;
      pushHistory(`relAnchor:${id}:${end}`);
      set(st => erdOps.updateRelationshipAnchor(docOf(st), id, end, anchor));
    },

    deleteRelationship: (id) => {
      const s = get();
      if (!s.relationships.find(r => r.id === id)) return;
      pushHistory('deleteRelationship');
      set(st => ({
        ...erdOps.deleteRelationship(docOf(st), id).doc,
        selectedEdgeId: st.selectedEdgeId === id ? null : st.selectedEdgeId,
        editorOpen: (st.editorOpen === 'relationship' && st.selectedEdgeId === id) ? null : st.editorOpen,
      }));
    },

    updateNodePosition: (id, pos) => {
      pushHistory(`movePos:${id}`);
      set(s => ({ nodePositions: { ...s.nodePositions, [id]: pos } }));
    },

    // 자동 정렬 등 전체 위치 일괄 변경 (히스토리 1회)
    setAllPositions: (positions) => {
      pushHistory('autoLayout');
      set({ nodePositions: positions });
    },

    setPendingConnection: (val) => set({ pendingConnection: val }),

    loadData: (entities, relationships, positions, memos = []) => {
      pushHistory('loadData');
      set({ entities, relationships, nodePositions: positions, memos, selectedEntityId: null, selectedEdgeId: null, selectedMemoId: null });
    },
  };
});
