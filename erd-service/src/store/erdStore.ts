import { create } from 'zustand';
import { Entity, Column, Relationship, RelationshipType, ColumnType } from '../types/erd';

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
  return type === 'ONE_TO_MANY_IDENTIFYING' || type === 'ONE_TO_ONE_IDENTIFYING';
}

// 식별 관계용 FK 컬럼 생성 (상위 엔티티 PK → 하위 엔티티 PK+FK)
function buildFKColumns(sourceEntity: Entity, sourceId: string): Column[] {
  return sourceEntity.columns.filter(c => c.isPK).map(pk => ({
    id: genId(),
    name: `${sourceEntity.name.toLowerCase()}_${pk.name}`,
    // 논리명: "상위엔티티논리명 + PK논리명" (예: "사용자 아이디"), 없으면 빈 값
    logicalName: pk.logicalName
      ? `${sourceEntity.logicalName || sourceEntity.name} ${pk.logicalName}`.trim()
      : '',
    type: pk.type as ColumnType,
    size: pk.size,
    isPK: true,
    isFK: true,
    isNN: true,
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

    addRelationship: (sourceId, targetId, type) => {
      const { entities } = get();
      const targetEntity = entities.find(e => e.id === targetId);
      const sourceEntity = entities.find(e => e.id === sourceId);
      if (!targetEntity || !sourceEntity) return;

      pushHistory('addRelationship');

      if (isIdentifyingType(type)) {
        const newFKColumns = buildFKColumns(sourceEntity, sourceId);
        set(s => ({
          entities: s.entities.map(e =>
            e.id === targetId ? { ...e, columns: [...e.columns, ...newFKColumns] } : e
          ),
          relationships: [...s.relationships, { id: genId(), sourceId, targetId, type }],
        }));
      } else {
        set(s => ({
          relationships: [...s.relationships, { id: genId(), sourceId, targetId, type }],
        }));
      }
    },

    // 관계 타입 변경 — 식별↔비식별 전환 시 자동 FK 컬럼도 추가/제거
    updateRelationshipType: (id, newType) => {
      const s = get();
      const rel = s.relationships.find(r => r.id === id);
      if (!rel || rel.type === newType) return;
      const sourceEntity = s.entities.find(e => e.id === rel.sourceId);
      if (!sourceEntity) return;

      pushHistory(`relType:${id}`);

      const wasIdent = isIdentifyingType(rel.type);
      const isIdent = isIdentifyingType(newType);

      let entities = s.entities;
      if (isIdent && !wasIdent) {
        // 비식별 → 식별: FK 컬럼 자동 추가
        const newFKColumns = buildFKColumns(sourceEntity, rel.sourceId);
        entities = entities.map(e =>
          e.id === rel.targetId ? { ...e, columns: [...e.columns, ...newFKColumns] } : e
        );
      } else if (!isIdent && wasIdent) {
        // 식별 → 비식별: 이 관계로 자동 추가된 FK 컬럼 제거 (refEntityId 기준)
        entities = entities.map(e =>
          e.id === rel.targetId
            ? { ...e, columns: e.columns.filter(c => !(c.isFK && c.refEntityId === rel.sourceId)) }
            : e
        );
      }

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
      // 식별 관계 삭제 시 이 관계로 자동 추가됐던 FK 컬럼도 제거 (타입 변경과 동일 규칙)
      let entities = s.entities;
      if (isIdentifyingType(rel.type)) {
        entities = entities.map(e =>
          e.id === rel.targetId
            ? { ...e, columns: e.columns.filter(c => !(c.isFK && c.refEntityId === rel.sourceId)) }
            : e
        );
      }
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
