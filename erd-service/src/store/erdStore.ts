import { create } from 'zustand';
import { Entity, Column, Relationship, RelationshipType, ColumnType, Subtype } from '../types/erd';

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface NodePosition { x: number; y: number }

// Undo/Redo용 문서 상태 스냅샷 (선택 상태는 제외)
interface Snapshot {
  entities: Entity[];
  relationships: Relationship[];
  nodePositions: Record<string, NodePosition>;
}

const HISTORY_LIMIT = 50;
// 같은 대상 연속 편집(키 입력 등)은 이 시간 내 병합되어 스냅샷 1개만 남긴다
const COALESCE_MS = 800;

function isIdentifyingType(type: RelationshipType): boolean {
  return (
    type === 'ONE_TO_MANY_IDENTIFYING' ||
    type === 'ONE_TO_MANY_IDENTIFYING_SOLID' ||
    type === 'ONE_TO_ONE_IDENTIFYING' ||
    type === 'ONE_TO_ONE_IDENTIFYING_SOLID'
  );
}

function isOptionalType(type: RelationshipType): boolean {
  return type === 'ONE_TO_MANY_OPTIONAL' || type === 'ONE_TO_ONE_OPTIONAL';
}

// 관계 타입별 FK 컬럼 플래그 — 식별: PK 포함, 비식별: 일반 FK, 선택: NULL 허용
function fkFlagsFor(type: RelationshipType): { isPK: boolean; isNN: boolean } {
  return {
    isPK: isIdentifyingType(type),
    isNN: !isOptionalType(type),
  };
}

// FK 컬럼 생성 (상위 엔티티 PK → 하위 엔티티 FK, 플래그는 관계 타입에 따름)
function buildFKColumns(
  sourceEntity: Entity,
  sourceId: string,
  flags: { isPK: boolean; isNN: boolean }
): Column[] {
  return sourceEntity.columns.filter(c => c.isPK).map(pk => ({
    id: genId(),
    // FK 컬럼명: 상위 엔티티 PK명 그대로 사용 (엔티티명 접두사 없음)
    name: pk.name,
    // 논리명: 상위 PK 논리명 그대로 (엔티티명 접두사 없음), 없으면 빈 값
    logicalName: pk.logicalName ?? '',
    type: pk.type as ColumnType,
    size: pk.size,
    isPK: flags.isPK,
    isFK: true,
    isNN: flags.isNN,
    isUnique: false,
    refEntityId: sourceId,
    refColumnId: pk.id,
  }));
}

interface ERDStore {
  entities: Entity[];
  relationships: Relationship[];
  nodePositions: Record<string, NodePosition>;
  selectedEntityId: string | null;
  pendingConnection: { sourceId: string; sourceHandle: string } | null;
  editingRelId: string | null;

  past: Snapshot[];
  future: Snapshot[];
  undo: () => void;
  redo: () => void;

  addEntity: () => void;
  updateEntity: (id: string, updates: Partial<Omit<Entity, 'id' | 'columns'>>) => void;
  deleteEntity: (id: string) => void;
  selectEntity: (id: string | null) => void;

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
  deleteRelationship: (id: string) => void;
  setEditingRel: (id: string | null) => void;

  updateNodePosition: (id: string, pos: NodePosition) => void;
  setAllPositions: (positions: Record<string, NodePosition>) => void;
  setPendingConnection: (val: ERDStore['pendingConnection']) => void;

  loadData: (entities: Entity[], relationships: Relationship[], positions: Record<string, NodePosition>) => void;
}

const DEFAULT_COLUMN: Omit<Column, 'id' | 'name'> = {
  logicalName: '',
  type: 'VARCHAR',
  size: '255',
  isPK: false,
  isFK: false,
  isNN: false,
  isUnique: false,
};

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
    selectedEntityId: null,
    pendingConnection: null,
    editingRelId: null,

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
      const id = genId();
      const count = get().entities.length + 1;
      const pkId = genId();
      const newEntity: Entity = {
        id,
        name: `Entity${count}`,
        logicalName: '',
        description: '',
        color: '#3b82f6',
        columns: [{
          id: pkId,
          name: 'id',
          type: 'INT',
          size: '',
          isPK: true,
          isFK: false,
          isNN: true,
          isUnique: true,
        }],
      };
      // 가로로 나란히 배치 (240px 간격)
      const col = (count - 1) % 4;
      const row = Math.floor((count - 1) / 4);
      set(s => ({
        entities: [...s.entities, newEntity],
        nodePositions: { ...s.nodePositions, [id]: { x: 80 + col * 260, y: 80 + row * 200 } },
        selectedEntityId: id,
      }));
    },

    updateEntity: (id, updates) => {
      pushHistory(`updateEntity:${id}:${Object.keys(updates).join(',')}`);
      set(s => ({
        entities: s.entities.map(e => e.id === id ? { ...e, ...updates } : e),
      }));
    },

    deleteEntity: (id) => {
      pushHistory('deleteEntity');
      set(s => ({
        // 엔티티 삭제 + 다른 엔티티에 남은, 삭제 대상을 참조하는 FK 컬럼도 함께 제거
        entities: s.entities
          .filter(e => e.id !== id)
          .map(e => {
            const columns = e.columns.filter(c => !(c.isFK && c.refEntityId === id));
            return columns.length === e.columns.length ? e : { ...e, columns };
          }),
        relationships: s.relationships.filter(r => r.sourceId !== id && r.targetId !== id),
        selectedEntityId: s.selectedEntityId === id ? null : s.selectedEntityId,
      }));
    },

    selectEntity: (id) => set({ selectedEntityId: id }),

    addColumn: (entityId) => {
      pushHistory('addColumn');
      const newCol: Column = {
        ...DEFAULT_COLUMN,
        id: genId(),
        name: 'column',
      };
      set(s => ({
        entities: s.entities.map(e =>
          e.id === entityId ? { ...e, columns: [...e.columns, newCol] } : e
        ),
      }));
    },

    updateColumn: (entityId, columnId, updates) => {
      pushHistory(`updateColumn:${columnId}:${Object.keys(updates).join(',')}`);
      set(s => ({
        entities: s.entities.map(e =>
          e.id === entityId
            ? { ...e, columns: e.columns.map(c => c.id === columnId ? { ...c, ...updates } : c) }
            : e
        ),
      }));
    },

    deleteColumn: (entityId, columnId) => {
      pushHistory('deleteColumn');
      set(s => ({
        entities: s.entities.map(e =>
          e.id === entityId ? { ...e, columns: e.columns.filter(c => c.id !== columnId) } : e
        ),
      }));
    },

    moveColumn: (entityId, fromIdx, toIdx) => {
      pushHistory('moveColumn');
      set(s => ({
        entities: s.entities.map(e => {
          if (e.id !== entityId) return e;
          const cols = [...e.columns];
          const [moved] = cols.splice(fromIdx, 1);
          cols.splice(toIdx, 0, moved);
          return { ...e, columns: cols };
        }),
      }));
    },

    // ── 배타적 서브타입(SubSet) ──
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
      const targetEntity = entities.find(e => e.id === targetId);
      const sourceEntity = entities.find(e => e.id === sourceId);
      if (!targetEntity || !sourceEntity) return;

      pushHistory('addRelationship');

      // 모든 관계 타입에서 FK 생성 — 식별이면 PK 포함, 비식별/선택이면 일반 FK
      const newFKColumns = buildFKColumns(sourceEntity, sourceId, fkFlagsFor(type));
      set(s => ({
        entities: s.entities.map(e =>
          e.id === targetId ? { ...e, columns: [...e.columns, ...newFKColumns] } : e
        ),
        relationships: [...s.relationships, { id: genId(), sourceId, targetId, type }],
      }));
    },

    // 관계 타입 변경 — FK 컬럼은 유지하고 플래그만 전환 (식별: PK 승격, 비식별: PK 해제, 선택: NULL 허용)
    updateRelationshipType: (id, newType) => {
      const s = get();
      const rel = s.relationships.find(r => r.id === id);
      if (!rel || rel.type === newType) return;
      const sourceEntity = s.entities.find(e => e.id === rel.sourceId);
      if (!sourceEntity) return;

      pushHistory(`relType:${id}`);

      const flags = fkFlagsFor(newType);
      const entities = s.entities.map(e => {
        if (e.id !== rel.targetId) return e;
        const hasAutoFK = e.columns.some(c => c.isFK && c.refEntityId === rel.sourceId);
        if (hasAutoFK) {
          // 기존 FK 플래그만 갱신 — 사용자가 수정한 컬럼명/논리명은 보존
          return {
            ...e,
            columns: e.columns.map(c =>
              c.isFK && c.refEntityId === rel.sourceId
                ? { ...c, isPK: flags.isPK, isNN: flags.isNN }
                : c
            ),
          };
        }
        // FK가 없는 기존 데이터(과거 비식별로 생성) — 새로 생성
        return { ...e, columns: [...e.columns, ...buildFKColumns(sourceEntity, rel.sourceId, flags)] };
      });

      set({
        entities,
        relationships: s.relationships.map(r => r.id === id ? { ...r, type: newType } : r),
      });
    },

    deleteRelationship: (id) => {
      const s = get();
      const rel = s.relationships.find(r => r.id === id);
      if (!rel) return;
      pushHistory('deleteRelationship');
      // 관계 삭제 시 이 관계로 자동 추가됐던 FK 컬럼도 제거 (모든 타입이 FK를 생성하므로)
      const entities = s.entities.map(e =>
        e.id === rel.targetId
          ? { ...e, columns: e.columns.filter(c => !(c.isFK && c.refEntityId === rel.sourceId)) }
          : e
      );
      set({ entities, relationships: s.relationships.filter(r => r.id !== id) });
    },

    setEditingRel: (id) => set({ editingRelId: id }),

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

    loadData: (entities, relationships, positions) => {
      pushHistory('loadData');
      set({ entities, relationships, nodePositions: positions, selectedEntityId: null });
    },
  };
});
