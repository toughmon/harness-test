import { create } from 'zustand';
import { Entity, Column, Relationship, RelationshipType, ColumnType } from '../types/erd';

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface NodePosition { x: number; y: number }

interface ERDStore {
  entities: Entity[];
  relationships: Relationship[];
  nodePositions: Record<string, NodePosition>;
  selectedEntityId: string | null;
  pendingConnection: { sourceId: string; sourceHandle: string } | null;

  addEntity: () => void;
  updateEntity: (id: string, updates: Partial<Omit<Entity, 'id' | 'columns'>>) => void;
  deleteEntity: (id: string) => void;
  selectEntity: (id: string | null) => void;

  addColumn: (entityId: string) => void;
  updateColumn: (entityId: string, columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (entityId: string, columnId: string) => void;
  moveColumn: (entityId: string, fromIdx: number, toIdx: number) => void;

  addRelationship: (sourceId: string, targetId: string, type: RelationshipType) => void;
  deleteRelationship: (id: string) => void;

  updateNodePosition: (id: string, pos: NodePosition) => void;
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

export const useERDStore = create<ERDStore>((set, get) => ({
  entities: [],
  relationships: [],
  nodePositions: {},
  selectedEntityId: null,
  pendingConnection: null,

  addEntity: () => {
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
    set(s => ({
      entities: s.entities.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  },

  deleteEntity: (id) => {
    set(s => ({
      entities: s.entities.filter(e => e.id !== id),
      relationships: s.relationships.filter(r => r.sourceId !== id && r.targetId !== id),
      selectedEntityId: s.selectedEntityId === id ? null : s.selectedEntityId,
    }));
  },

  selectEntity: (id) => set({ selectedEntityId: id }),

  addColumn: (entityId) => {
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
    set(s => ({
      entities: s.entities.map(e =>
        e.id === entityId
          ? { ...e, columns: e.columns.map(c => c.id === columnId ? { ...c, ...updates } : c) }
          : e
      ),
    }));
  },

  deleteColumn: (entityId, columnId) => {
    set(s => ({
      entities: s.entities.map(e =>
        e.id === entityId ? { ...e, columns: e.columns.filter(c => c.id !== columnId) } : e
      ),
    }));
  },

  moveColumn: (entityId, fromIdx, toIdx) => {
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

    const isIdentifying =
      type === 'ONE_TO_MANY_IDENTIFYING' || type === 'ONE_TO_ONE_IDENTIFYING';

    if (isIdentifying) {
      const sourcePKs = sourceEntity.columns.filter(c => c.isPK);
      const newFKColumns: Column[] = sourcePKs.map(pk => ({
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

  deleteRelationship: (id) => {
    set(s => ({ relationships: s.relationships.filter(r => r.id !== id) }));
  },

  updateNodePosition: (id, pos) => {
    set(s => ({ nodePositions: { ...s.nodePositions, [id]: pos } }));
  },

  setPendingConnection: (val) => set({ pendingConnection: val }),

  loadData: (entities, relationships, positions) => {
    set({ entities, relationships, nodePositions: positions, selectedEntityId: null });
  },
}));
