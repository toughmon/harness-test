import { Column, ColumnType, Entity, Relationship, RelationshipType } from '../types/erd';

// ──────────────────────────────────────────────────────────────────────────
// 프레임워크 비의존 ERD 변형 로직 — Zustand store(브라우저)와 MCP 서버(Node)가 공유.
// 모든 변형은 (doc, ...args) => 새 ErdDoc 형태의 순수 함수다. set/get·히스토리·선택
// 상태 같은 UI 관심사는 호출부(store)가 담당한다. 여기에 DOM·외부 의존성을 두지 말 것.
// ──────────────────────────────────────────────────────────────────────────

export interface NodePosition { x: number; y: number }

export interface ErdDoc {
  entities: Entity[];
  relationships: Relationship[];
  nodePositions: Record<string, NodePosition>;
}

export const genId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const DEFAULT_COLUMN: Omit<Column, 'id' | 'name'> = {
  logicalName: '',
  type: 'VARCHAR',
  size: '255',
  isPK: false,
  isFK: false,
  isNN: false,
  isUnique: false,
};

export function isIdentifyingType(type: RelationshipType): boolean {
  return (
    type === 'ONE_TO_MANY_IDENTIFYING' ||
    type === 'ONE_TO_MANY_IDENTIFYING_SOLID' ||
    type === 'ONE_TO_ONE_IDENTIFYING' ||
    type === 'ONE_TO_ONE_IDENTIFYING_SOLID'
  );
}

export function isOptionalType(type: RelationshipType): boolean {
  return type === 'ONE_TO_MANY_OPTIONAL' || type === 'ONE_TO_ONE_OPTIONAL';
}

// 관계 타입별 FK 컬럼 플래그 — 식별: PK 포함, 비식별: 일반 FK, 선택: NULL 허용
export function fkFlagsFor(type: RelationshipType): { isPK: boolean; isNN: boolean } {
  return {
    isPK: isIdentifyingType(type),
    isNN: !isOptionalType(type),
  };
}

// FK 컬럼 생성 (상위 엔티티 PK → 하위 엔티티 FK, 플래그는 관계 타입에 따름)
export function buildFKColumns(
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

// 새 엔티티의 기본 위치 — 가로로 나란히 배치 (4열 그리드, 260×200px 간격)
export function nextEntityPosition(doc: ErdDoc): NodePosition {
  const count = doc.entities.length + 1;
  const col = (count - 1) % 4;
  const row = Math.floor((count - 1) / 4);
  return { x: 80 + col * 260, y: 80 + row * 200 };
}

function defaultIdColumn(): Column {
  return {
    id: genId(),
    name: 'id',
    type: 'INT',
    size: '',
    isPK: true,
    isFK: false,
    isNN: true,
    isUnique: true,
  };
}

export interface AddEntityOptions {
  name?: string;
  logicalName?: string;
  description?: string;
  color?: string;
  position?: NodePosition;
  withDefaultId?: boolean;   // 기본 id PK 컬럼 자동 추가 (기본 true)
  columns?: Column[];        // 지정 시 columns를 그대로 사용 (withDefaultId 무시)
}

export function addEntity(doc: ErdDoc, opts: AddEntityOptions = {}): { doc: ErdDoc; entityId: string } {
  const id = genId();
  const count = doc.entities.length + 1;
  const withDefaultId = opts.withDefaultId ?? true;
  const columns = opts.columns ?? (withDefaultId ? [defaultIdColumn()] : []);
  const newEntity: Entity = {
    id,
    name: opts.name ?? `Entity${count}`,
    logicalName: opts.logicalName ?? '',
    description: opts.description ?? '',
    color: opts.color ?? '#3b82f6',
    columns,
  };
  const position = opts.position ?? nextEntityPosition(doc);
  return {
    doc: {
      ...doc,
      entities: [...doc.entities, newEntity],
      nodePositions: { ...doc.nodePositions, [id]: position },
    },
    entityId: id,
  };
}

export function updateEntity(
  doc: ErdDoc,
  id: string,
  updates: Partial<Omit<Entity, 'id' | 'columns'>>
): ErdDoc {
  return {
    ...doc,
    entities: doc.entities.map(e => (e.id === id ? { ...e, ...updates } : e)),
  };
}

// 엔티티 삭제 + 다른 엔티티에 남은, 삭제 대상을 참조하는 FK 컬럼/관계도 함께 제거
export function deleteEntity(doc: ErdDoc, id: string): ErdDoc {
  return {
    ...doc,
    entities: doc.entities
      .filter(e => e.id !== id)
      .map(e => {
        const columns = e.columns.filter(c => !(c.isFK && c.refEntityId === id));
        return columns.length === e.columns.length ? e : { ...e, columns };
      }),
    relationships: doc.relationships.filter(r => r.sourceId !== id && r.targetId !== id),
  };
}

export function addColumn(
  doc: ErdDoc,
  entityId: string,
  col: Partial<Omit<Column, 'id'>> = {}
): { doc: ErdDoc; columnId: string } {
  const newCol: Column = { ...DEFAULT_COLUMN, name: 'column', ...col, id: genId() };
  return {
    doc: {
      ...doc,
      entities: doc.entities.map(e =>
        e.id === entityId ? { ...e, columns: [...e.columns, newCol] } : e
      ),
    },
    columnId: newCol.id,
  };
}

export function updateColumn(
  doc: ErdDoc,
  entityId: string,
  columnId: string,
  updates: Partial<Column>
): ErdDoc {
  return {
    ...doc,
    entities: doc.entities.map(e =>
      e.id === entityId
        ? { ...e, columns: e.columns.map(c => (c.id === columnId ? { ...c, ...updates } : c)) }
        : e
    ),
  };
}

export function deleteColumn(doc: ErdDoc, entityId: string, columnId: string): ErdDoc {
  return {
    ...doc,
    entities: doc.entities.map(e =>
      e.id === entityId ? { ...e, columns: e.columns.filter(c => c.id !== columnId) } : e
    ),
  };
}

export function moveColumn(doc: ErdDoc, entityId: string, fromIdx: number, toIdx: number): ErdDoc {
  return {
    ...doc,
    entities: doc.entities.map(e => {
      if (e.id !== entityId) return e;
      const cols = [...e.columns];
      const [moved] = cols.splice(fromIdx, 1);
      cols.splice(toIdx, 0, moved);
      return { ...e, columns: cols };
    }),
  };
}

// 관계 추가 — 모든 타입에서 FK 생성(식별이면 PK 포함). 이름 충돌 컬럼은 교체하되,
// 다른 관계에서 만들어진 FK는 유지한다.
export function addRelationship(
  doc: ErdDoc,
  sourceId: string,
  targetId: string,
  type: RelationshipType
): { doc: ErdDoc; relationshipId: string | null; fkColumnsAdded: Column[] } {
  const sourceEntity = doc.entities.find(e => e.id === sourceId);
  const targetEntity = doc.entities.find(e => e.id === targetId);
  if (!sourceEntity || !targetEntity) {
    return { doc, relationshipId: null, fkColumnsAdded: [] };
  }
  const newFKColumns = buildFKColumns(sourceEntity, sourceId, fkFlagsFor(type));
  const fkNames = new Set(newFKColumns.map(c => c.name));
  const relationshipId = genId();
  return {
    doc: {
      ...doc,
      entities: doc.entities.map(e =>
        e.id === targetId
          ? {
              ...e,
              columns: [
                ...e.columns.filter(c => !fkNames.has(c.name) || (c.isFK && c.refEntityId !== sourceId)),
                ...newFKColumns,
              ],
            }
          : e
      ),
      relationships: [...doc.relationships, { id: relationshipId, sourceId, targetId, type }],
    },
    relationshipId,
    fkColumnsAdded: newFKColumns,
  };
}

// 관계 타입 변경 — 기존 auto-FK는 플래그만 전환(사용자 수정 컬럼명/논리명 보존),
// FK가 없으면 새로 생성. changed=false면 변경 없음(no-op).
export function updateRelationshipType(
  doc: ErdDoc,
  id: string,
  newType: RelationshipType
): { doc: ErdDoc; changed: boolean } {
  const rel = doc.relationships.find(r => r.id === id);
  if (!rel || rel.type === newType) return { doc, changed: false };
  const sourceEntity = doc.entities.find(e => e.id === rel.sourceId);
  if (!sourceEntity) return { doc, changed: false };

  const flags = fkFlagsFor(newType);
  const entities = doc.entities.map(e => {
    if (e.id !== rel.targetId) return e;
    const hasAutoFK = e.columns.some(c => c.isFK && c.refEntityId === rel.sourceId);
    if (hasAutoFK) {
      // 기존 FK 플래그만 갱신 — 사용자가 수정한 컬럼명/논리명은 보존
      return {
        ...e,
        columns: e.columns.map(c =>
          c.isFK && c.refEntityId === rel.sourceId ? { ...c, isPK: flags.isPK, isNN: flags.isNN } : c
        ),
      };
    }
    // FK가 없는 기존 데이터 — 새로 생성 (이름 충돌 컬럼 교체)
    const newCols = buildFKColumns(sourceEntity, rel.sourceId, flags);
    const names = new Set(newCols.map(c => c.name));
    return {
      ...e,
      columns: [
        ...e.columns.filter(c => !names.has(c.name) || (c.isFK && c.refEntityId !== rel.sourceId)),
        ...newCols,
      ],
    };
  });

  return {
    doc: {
      ...doc,
      entities,
      relationships: doc.relationships.map(r => (r.id === id ? { ...r, type: newType } : r)),
    },
    changed: true,
  };
}

// 관계 삭제 — 이 관계로 자동 추가됐던 FK 컬럼도 제거
export function deleteRelationship(doc: ErdDoc, id: string): { doc: ErdDoc; removed: boolean } {
  const rel = doc.relationships.find(r => r.id === id);
  if (!rel) return { doc, removed: false };
  const entities = doc.entities.map(e =>
    e.id === rel.targetId
      ? { ...e, columns: e.columns.filter(c => !(c.isFK && c.refEntityId === rel.sourceId)) }
      : e
  );
  return {
    doc: { ...doc, entities, relationships: doc.relationships.filter(r => r.id !== id) },
    removed: true,
  };
}
