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
  editorOpen: 'entity' | 'relationship' | 'memo' | null;
  // 드래그 박스(러버밴드)로 여러 엔티티/메모를 한 번에 선택했을 때의 id 목록.
  // 단일 선택 시에도 항상 갱신되어(길이 0 또는 1) selectedEntityId/selectedMemoId와 일관됨.
  selectedEntityIds: string[];
  selectedMemoIds: string[];
  setSelection: (entityIds: string[], memoIds: string[]) => void;
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
  openEntityEditor: (id: string) => void;
  openRelationshipEditor: (id: string) => void;
  openMemoEditor: (id: string) => void;
  closeEditor: () => void;

  addMemo: (pos?: { x: number; y: number }) => void;
  updateMemo: (id: string, updates: Partial<Omit<Memo, 'id'>>) => void;
  deleteMemo: (id: string) => void;
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

  addRelationship: (
    sourceId: string,
    targetId: string,
    type: RelationshipType,
    scope?: { sourceSubtypeId?: string; targetSubtypeId?: string },
  ) => void;
  updateRelationshipType: (id: string, type: RelationshipType) => void;
  updateRelationshipSides: (id: string, partial: Partial<RelationshipSides>) => void;
  updateRelationshipAnchor: (id: string, end: 'source' | 'target', anchor: EndpointAnchor | null) => void;
  updateRelationshipSubtypeScope: (id: string, side: 'source' | 'target', subtypeId: string | null) => void;
  deleteRelationship: (id: string) => void;

  // 엔티티/메모 위치 일괄 이동(그룹 드래그) — 여러 개를 한 번에 옮겨도 Undo 1회로 전체 복원됨
  moveNodes: (
    entityMoves: { id: string; pos: NodePosition }[],
    memoMoves: { id: string; x: number; y: number }[],
  ) => void;
  setAllPositions: (positions: Record<string, NodePosition>) => void;
  // 다중 선택된 엔티티/메모 일괄 삭제(Undo 1회로 전체 복원됨)
  deleteMany: (entityIds: string[], memoIds: string[]) => void;
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
    editorOpen: null,
    selectedEntityIds: [],
    selectedMemoIds: [],
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
          // 삭제된 엔티티의 편집 모달이 열려 있었다면 같이 닫는다 (남겨두면 이후 다른 엔티티를 선택할 때 잘못 재오픈됨)
          editorOpen: (s.editorOpen === 'entity' && s.selectedEntityId === id) ? null : s.editorOpen,
          selectedEntityIds: s.selectedEntityIds.filter(eid => eid !== id),
        };
      });
      emit('deleteEntity', [id]);
    },

    // 엔티티/엣지/메모 "선택"(하이라이트)만 한다 — 편집 모달은 openXEditor로 별도 오픈.
    // editorOpen은 여기서 건드리지 않는다: 캔버스는 모달이 열려 있으면 클릭이 막히므로 정상 사용
    // 경로로는 절대 동시에 안 일어나지만, 모달 뒤에 가려진 메모 textarea가 onFocus에서 selectMemo를
    // 호출하는 경우처럼 클릭이 아닌 경로로 선택이 트리거될 수 있어 — 거기서 모달을 닫아버리면 안 된다.
    // 삭제로 편집 대상이 사라져 editorOpen이 stale해지는 경우는 각 deleteX 액션에서 정리한다.
    // 다중 선택 목록도 함께 초기화(단일 선택으로 전환).
    selectEntity: (id) => set({ selectedEntityId: id, selectedEdgeId: null, selectedMemoId: null, selectedEntityIds: [], selectedMemoIds: [] }),
    selectEdge: (id) => set({ selectedEdgeId: id, selectedEntityId: null, selectedMemoId: null, selectedEntityIds: [], selectedMemoIds: [] }),
    selectMemo: (id) => set({ selectedMemoId: id, selectedEntityId: null, selectedEdgeId: null, selectedEntityIds: [], selectedMemoIds: [] }),

    // 러버밴드 박스 선택(또는 Ctrl/Shift 클릭)으로 React Flow가 선택한 엔티티/메모 id 목록을 반영.
    // 정확히 1개면 기존 단일 선택 id도 함께 갱신해 상세 편집 패널이 그대로 뜨도록 한다.
    // 엣지 선택(selectedEdgeId)은 onEdgeClick이 별도 관리하므로, 실제로 노드가 선택됐을 때만 해제한다.
    // editorOpen은 여기서도 건드리지 않는다(위 selectEntity/selectEdge/selectMemo와 동일 이유 —
    // 모달이 열려 있으면 캔버스 드래그 박스 선택 자체가 발생할 수 없어 정상 경로에서는 충돌하지 않는다).
    setSelection: (entityIds, memoIds) => set(s => ({
      selectedEntityIds: entityIds,
      selectedMemoIds: memoIds,
      selectedEntityId: entityIds.length === 1 ? entityIds[0] : null,
      selectedMemoId: memoIds.length === 1 ? memoIds[0] : null,
      selectedEdgeId: (entityIds.length + memoIds.length) > 0 ? null : s.selectedEdgeId,
    })),

    // 편집 모달 트리거 — info 아이콘 클릭 / ✎ 아이콘 클릭 / 우클릭 컨텍스트 메뉴 "편집"에서 호출
    openEntityEditor: (id) => set({ selectedEntityId: id, selectedEdgeId: null, selectedMemoId: null, editorOpen: 'entity' }),
    openRelationshipEditor: (id) => set({ selectedEdgeId: id, selectedEntityId: null, selectedMemoId: null, editorOpen: 'relationship' }),
    openMemoEditor: (id) => set({ selectedMemoId: id, selectedEntityId: null, selectedEdgeId: null, editorOpen: 'memo' }),
    closeEditor: () => set({ editorOpen: null }),

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
        editorOpen: (s.editorOpen === 'memo' && s.selectedMemoId === id) ? null : s.editorOpen,
        selectedMemoIds: s.selectedMemoIds.filter(mid => mid !== id),
      }));
      emit('deleteMemo', [id]);
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
      set(s => {
        // 이 서브타입을 스코프로 참조하는 관계/FK 먼저 정리(erdOps.deleteEntity와 대칭되는 캐스케이드)
        const cascaded = erdOps.removeSubtypeCascade(docOf(s), entityId, subtypeId);
        return {
          ...cascaded,
          entities: cascaded.entities.map(e =>
            e.id === entityId
              ? { ...e, subtypes: (e.subtypes ?? []).filter(st => st.id !== subtypeId) }
              : e
          ),
        };
      });
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

    addRelationship: (sourceId, targetId, type, scope) => {
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
      set(s => erdOps.addRelationship(docOf(s), sourceId, targetId, type, undefined, ids, scope).doc);
      emit('addRelationship', [sourceId, targetId, type, undefined, ids, scope]);
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

    // 관계의 부모/자식 side를 특정 서브타입으로 스코프 지정(subtypeId=null이면 엔티티 전체로 해제)
    updateRelationshipSubtypeScope: (id, side, subtypeId) => {
      if (get().readOnly) return;
      const s = get();
      if (!s.relationships.find(r => r.id === id)) return;
      pushHistory(`relSubtypeScope:${id}:${side}`);
      set(st => erdOps.updateRelationshipSubtypeScope(docOf(st), id, side, subtypeId).doc);
      emit('updateRelationshipSubtypeScope', [id, side, subtypeId]);
    },

    deleteRelationship: (id) => {
      if (get().readOnly) return;
      const s = get();
      if (!s.relationships.find(r => r.id === id)) return;
      pushHistory('deleteRelationship');
      set(st => ({
        ...erdOps.deleteRelationship(docOf(st), id).doc,
        selectedEdgeId: st.selectedEdgeId === id ? null : st.selectedEdgeId,
        editorOpen: (st.editorOpen === 'relationship' && st.selectedEdgeId === id) ? null : st.editorOpen,
      }));
      emit('deleteRelationship', [id]);
    },

    // 단일 노드든 러버밴드로 묶인 그룹이든, 한 번의 드래그로 함께 이동한 엔티티/메모를
    // 전부 여기로 모아 히스토리 1회만 남긴다(그룹 이동을 Undo 한 번으로 되돌리기 위함).
    moveNodes: (entityMoves, memoMoves) => {
      if (get().readOnly) return;
      if (entityMoves.length === 0 && memoMoves.length === 0) return;
      const key = `moveNodes:${[...entityMoves.map(m => m.id), ...memoMoves.map(m => m.id)].sort().join(',')}`;
      pushHistory(key);
      set(s => ({
        nodePositions: entityMoves.length
          ? { ...s.nodePositions, ...Object.fromEntries(entityMoves.map(m => [m.id, m.pos])) }
          : s.nodePositions,
        memos: memoMoves.length
          ? s.memos.map(m => {
              const mv = memoMoves.find(x => x.id === m.id);
              return mv ? { ...m, x: mv.x, y: mv.y } : m;
            })
          : s.memos,
      }));
      entityMoves.forEach(({ id, pos }) => emit('setNodePosition', [id, pos]));
      memoMoves.forEach(({ id, x, y }) => emit('updateMemo', [id, { x, y }]));
    },

    // 자동 정렬 등 전체 위치 일괄 변경 (히스토리 1회). op 어휘 밖이라 협업 시 스냅샷 백스톱으로 전파.
    setAllPositions: (positions) => {
      if (get().readOnly) return;
      pushHistory('autoLayout');
      set({ nodePositions: positions });
    },

    // 다중 선택 일괄 삭제 — deleteEntity/deleteMemo를 한 번의 히스토리 스냅샷 안에서 순차 적용
    deleteMany: (entityIds, memoIds) => {
      if (get().readOnly) return;
      if (entityIds.length === 0 && memoIds.length === 0) return;
      pushHistory('deleteMany');
      set(s => {
        let doc = docOf(s);
        entityIds.forEach(id => { doc = erdOps.deleteEntity(doc, id); });
        memoIds.forEach(id => { doc = erdOps.deleteMemo(doc, id); });
        return {
          ...doc,
          selectedEntityId: s.selectedEntityId && entityIds.includes(s.selectedEntityId) ? null : s.selectedEntityId,
          selectedMemoId: s.selectedMemoId && memoIds.includes(s.selectedMemoId) ? null : s.selectedMemoId,
          selectedEdgeId: doc.relationships.some(r => r.id === s.selectedEdgeId) ? s.selectedEdgeId : null,
          selectedEntityIds: [],
          selectedMemoIds: [],
        };
      });
      entityIds.forEach(id => emit('deleteEntity', [id]));
      memoIds.forEach(id => emit('deleteMemo', [id]));
    },

    setPendingConnection: (val) => set({ pendingConnection: val }),

    loadData: (entities, relationships, positions, memos = [], opts) => {
      if (!opts?.silent) pushHistory('loadData');
      set({ entities, relationships, nodePositions: positions, memos, selectedEntityId: null, selectedEdgeId: null, selectedMemoId: null, selectedEntityIds: [], selectedMemoIds: [] });
    },
  };
});
