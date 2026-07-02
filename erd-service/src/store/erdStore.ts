import { create } from 'zustand';
import { Entity, Column, Memo, Relationship, RelationshipType, Subtype, EndpointAnchor } from '../types/erd';
import * as erdOps from '../core/erdOps';
import { genId, DEFAULT_COLUMN, type NodePosition, type ErdDoc } from '../core/erdOps';
import { applyOp, type OpName } from '../core/opDispatch';
import type { RelationshipSides } from '../core/relationshipSides';

// 변형 로직은 ../core/erdOps(순수 함수, MCP 서버·협업 릴레이와 공유)에 있고, 여기서는 히스토리·
// 선택 상태·dirty 추적 같은 UI 관심사만 감싼다. erdOps.fn(docOf(s), ...)을 호출해 결과
// 문서를 set으로 머지한다. 서브타입/위치/undo·redo/loadData는 UI 전용이라 인라인 유지.

// ── 실시간 협업: 로컬 변형을 op로 내보내는 에미터(collabStore가 등록). 순환 import를 피하려
//    erdStore는 collabStore를 import하지 않고, 등록된 콜백만 호출한다. applyRemote는 내보내지 않는다.
export type OpEmitter = (op: OpName, args: unknown[]) => void;
let opEmitter: OpEmitter | null = null;
export const setOpEmitter = (fn: OpEmitter | null) => { opEmitter = fn; };

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
  pendingConnection: { sourceId: string; sourceHandle: string } | null;

  // 협업 읽기 전용 모드 — 공유 뷰어일 때 true. 모든 로컬 변형/undo를 막는다(방어).
  readOnly: boolean;
  setReadOnly: (v: boolean) => void;
  // 원격 op를 히스토리 없이 적용 (collabStore가 수신 프레임에 대해 호출)
  applyRemote: (op: OpName, args: unknown[]) => void;

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

  loadData: (
    entities: Entity[],
    relationships: Relationship[],
    positions: Record<string, NodePosition>,
    memos?: Memo[],
    opts?: { silent?: boolean },
  ) => void;
}

export const useERDStore = create<ERDStore>((set, get) => {
  // ---- Undo/Redo 내부 상태 ----
  let lastActionKey = '';
  let lastActionTime = 0;

  // 로컬 변형을 협업 룸으로 내보낸다(등록된 에미터가 연결/편집권한을 판단). applyRemote에서는 호출 안 함.
  const emit = (op: OpName, args: unknown[]) => { opEmitter?.(op, args); };

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
    pendingConnection: null,

    readOnly: false,
    setReadOnly: (v) => set({ readOnly: v }),

    // 원격 op 적용 — 히스토리·선택 변경 없음, dirty 유발은 collabStore가 제어(applyingRemote)
    applyRemote: (op, args) => {
      set(s => applyOp(docOf(s), { op, args: args as unknown[] }));
    },

    past: [],
    future: [],

    undo: () => {
      if (get().readOnly) return;
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
      if (get().readOnly) return;
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
      if (get().readOnly) return;
      const id = genId();
      pushHistory('addEntity');
      set(s => {
        const { doc } = erdOps.addEntity(docOf(s), { id });
        return { ...doc, selectedEntityId: id };
      });
      emit('addEntity', [{ id }]);
    },

    updateEntity: (id, updates) => {
      if (get().readOnly) return;
      pushHistory(`updateEntity:${id}:${Object.keys(updates).join(',')}`);
      set(s => erdOps.updateEntity(docOf(s), id, updates));
      emit('updateEntity', [id, updates]);
    },

    deleteEntity: (id) => {
      if (get().readOnly) return;
      pushHistory('deleteEntity');
      set(s => {
        const doc = erdOps.deleteEntity(docOf(s), id);
        return {
          ...doc,
          selectedEntityId: s.selectedEntityId === id ? null : s.selectedEntityId,
          // 삭제로 사라진 관계를 선택 중이었다면 엣지 선택 해제
          selectedEdgeId: doc.relationships.some(r => r.id === s.selectedEdgeId) ? s.selectedEdgeId : null,
        };
      });
      emit('deleteEntity', [id]);
    },

    // 엔티티/엣지/메모 선택은 상호 배타
    selectEntity: (id) => set({ selectedEntityId: id, selectedEdgeId: null, selectedMemoId: null }),
    selectEdge: (id) => set({ selectedEdgeId: id, selectedEntityId: null, selectedMemoId: null }),
    selectMemo: (id) => set({ selectedMemoId: id, selectedEntityId: null, selectedEdgeId: null }),

    addMemo: (pos) => {
      if (get().readOnly) return;
      const id = genId();
      const opts = { id, ...(pos ?? { x: 200, y: 200 }) };
      pushHistory('addMemo');
      set(s => {
        const { doc } = erdOps.addMemo(docOf(s), opts);
        return { ...doc, selectedMemoId: id, selectedEntityId: null, selectedEdgeId: null };
      });
      emit('addMemo', [opts]);
    },

    updateMemo: (id, updates) => {
      if (get().readOnly) return;
      pushHistory(`updateMemo:${id}:${Object.keys(updates).join(',')}`);
      set(s => erdOps.updateMemo(docOf(s), id, updates));
      emit('updateMemo', [id, updates]);
    },

    deleteMemo: (id) => {
      if (get().readOnly) return;
      pushHistory('deleteMemo');
      set(s => ({
        ...erdOps.deleteMemo(docOf(s), id),
        selectedMemoId: s.selectedMemoId === id ? null : s.selectedMemoId,
      }));
      emit('deleteMemo', [id]);
    },

    updateMemoPosition: (id, x, y) => {
      if (get().readOnly) return;
      pushHistory(`moveMemo:${id}`);
      set(s => erdOps.updateMemo(docOf(s), id, { x, y }));
      emit('updateMemo', [id, { x, y }]);
    },

    updateMemoSize: (id, w, h) => {
      if (get().readOnly) return;
      pushHistory(`resizeMemo:${id}`);
      set(s => erdOps.updateMemo(docOf(s), id, { width: w, height: h }));
      emit('updateMemo', [id, { width: w, height: h }]);
    },

    addColumn: (entityId) => {
      if (get().readOnly) return;
      const id = genId();
      pushHistory('addColumn');
      set(s => erdOps.addColumn(docOf(s), entityId, { id }).doc);
      emit('addColumn', [entityId, { id }]);
    },

    updateColumn: (entityId, columnId, updates) => {
      if (get().readOnly) return;
      pushHistory(`updateColumn:${columnId}:${Object.keys(updates).join(',')}`);
      set(s => erdOps.updateColumn(docOf(s), entityId, columnId, updates));
      emit('updateColumn', [entityId, columnId, updates]);
    },

    deleteColumn: (entityId, columnId) => {
      if (get().readOnly) return;
      pushHistory('deleteColumn');
      set(s => erdOps.deleteColumn(docOf(s), entityId, columnId));
      emit('deleteColumn', [entityId, columnId]);
    },

    moveColumn: (entityId, fromIdx, toIdx) => {
      if (get().readOnly) return;
      pushHistory('moveColumn');
      set(s => erdOps.moveColumn(docOf(s), entityId, fromIdx, toIdx));
      emit('moveColumn', [entityId, fromIdx, toIdx]);
    },

    // ── 배타적 서브타입(SubSet) — UI 전용, 인라인 유지. op 어휘 밖이라 협업 시 스냅샷 백스톱으로 전파 ──
    addSubtype: (entityId) => {
      if (get().readOnly) return;
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
      if (get().readOnly) return;
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
      if (get().readOnly) return;
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
      if (get().readOnly) return;
      pushHistory(`subsetMeta:${entityId}:${Object.keys(updates).join(',')}`);
      set(s => ({
        entities: s.entities.map(e => e.id === entityId ? { ...e, ...updates } : e),
      }));
    },

    addSubtypeColumn: (entityId, subtypeId) => {
      if (get().readOnly) return;
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
      if (get().readOnly) return;
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
      if (get().readOnly) return;
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
      if (get().readOnly) return;
      const { entities } = get();
      // 엔티티가 모두 존재할 때만 히스토리를 남긴다 (erdOps도 동일하게 no-op 처리)
      const source = entities.find(e => e.id === sourceId);
      if (!source || !entities.find(e => e.id === targetId)) return;
      // 협업 피어 간 동일 id 재현을 위해 관계 id·FK 컬럼 id를 미리 만들어 op에 싣는다
      const relationshipId = genId();
      const fkColumnIds = source.columns.filter(c => c.isPK).map(() => genId());
      const ids = { relationshipId, fkColumnIds };
      pushHistory('addRelationship');
      set(s => erdOps.addRelationship(docOf(s), sourceId, targetId, type, undefined, ids).doc);
      emit('addRelationship', [sourceId, targetId, type, undefined, ids]);
    },

    updateRelationshipType: (id, newType) => {
      if (get().readOnly) return;
      const s = get();
      const rel = s.relationships.find(r => r.id === id);
      if (!rel || rel.type === newType) return;
      if (!s.entities.find(e => e.id === rel.sourceId)) return;
      pushHistory(`relType:${id}`);
      set(st => erdOps.updateRelationshipType(docOf(st), id, newType).doc);
      emit('updateRelationshipType', [id, newType]);
    },

    // 관계선 좌/우 절반 속성 부분 갱신 (FK 플래그 동반 갱신, undo 지원)
    updateRelationshipSides: (id, partial) => {
      if (get().readOnly) return;
      const s = get();
      const rel = s.relationships.find(r => r.id === id);
      if (!rel) return;
      if (!s.entities.find(e => e.id === rel.sourceId)) return;
      pushHistory(`relSides:${id}`);
      set(st => erdOps.updateRelationshipSides(docOf(st), id, partial).doc);
      emit('updateRelationshipSides', [id, partial]);
    },

    // 관계선 끝점 수동 부착 위치 (드래그 종료 시 1회 커밋, undo 지원). anchor=null이면 자동 복귀.
    updateRelationshipAnchor: (id, end, anchor) => {
      if (get().readOnly) return;
      const s = get();
      if (!s.relationships.find(r => r.id === id)) return;
      pushHistory(`relAnchor:${id}:${end}`);
      set(st => erdOps.updateRelationshipAnchor(docOf(st), id, end, anchor));
      emit('updateRelationshipAnchor', [id, end, anchor]);
    },

    deleteRelationship: (id) => {
      if (get().readOnly) return;
      const s = get();
      if (!s.relationships.find(r => r.id === id)) return;
      pushHistory('deleteRelationship');
      set(st => ({
        ...erdOps.deleteRelationship(docOf(st), id).doc,
        selectedEdgeId: st.selectedEdgeId === id ? null : st.selectedEdgeId,
      }));
      emit('deleteRelationship', [id]);
    },

    updateNodePosition: (id, pos) => {
      if (get().readOnly) return;
      pushHistory(`movePos:${id}`);
      set(s => ({ nodePositions: { ...s.nodePositions, [id]: pos } }));
      emit('setNodePosition', [id, pos]);
    },

    // 자동 정렬 등 전체 위치 일괄 변경 (히스토리 1회). op 어휘 밖이라 협업 시 스냅샷 백스톱으로 전파.
    setAllPositions: (positions) => {
      if (get().readOnly) return;
      pushHistory('autoLayout');
      set({ nodePositions: positions });
    },

    setPendingConnection: (val) => set({ pendingConnection: val }),

    loadData: (entities, relationships, positions, memos = [], opts) => {
      if (!opts?.silent) pushHistory('loadData');
      set({ entities, relationships, nodePositions: positions, memos, selectedEntityId: null, selectedEdgeId: null, selectedMemoId: null });
    },
  };
});
