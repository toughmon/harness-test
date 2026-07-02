import { Column, ColumnType, Entity, Memo, MEMO_COLORS, Relationship, RelationshipType, EndpointAnchor } from '../types/erd';
import {
  RelationshipSides,
  sidesFromType,
  sidesToType,
  deriveSides,
  fkFlagsForSides,
  applySides,
} from './relationshipSides';

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
  memos: Memo[];
}

export interface AddMemoOptions {
  id?: string;   // 협업 시 피어 간 동일 id 재현용(미지정 시 새로 생성)
  x?: number;
  y?: number;
  text?: string;
  color?: string;
  width?: number;
  height?: number;
}

export function addMemo(doc: ErdDoc, opts: AddMemoOptions = {}): { doc: ErdDoc; memoId: string } {
  const id = opts.id ?? genId();
  const newMemo: Memo = {
    id,
    text: opts.text ?? '',
    x: opts.x ?? 100,
    y: opts.y ?? 100,
    width: opts.width ?? 220,
    height: opts.height ?? 140,
    color: opts.color ?? MEMO_COLORS[0],
  };
  return { doc: { ...doc, memos: [...doc.memos, newMemo] }, memoId: id };
}

export function updateMemo(doc: ErdDoc, id: string, updates: Partial<Omit<Memo, 'id'>>): ErdDoc {
  return { ...doc, memos: doc.memos.map(m => m.id === id ? { ...m, ...updates } : m) };
}

export function deleteMemo(doc: ErdDoc, id: string): ErdDoc {
  return { ...doc, memos: doc.memos.filter(m => m.id !== id) };
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
  flags: { isPK: boolean; isNN: boolean },
  namePrefix = '',  // 자기 참조 시 'parent_' 등으로 PK명 충돌 방지
  ids?: string[],   // 협업 시 피어 간 동일 FK 컬럼 id 재현용(PK 컬럼 순서로 정렬)
): Column[] {
  return sourceEntity.columns.filter(c => c.isPK).map((pk, i) => ({
    id: ids?.[i] ?? genId(),
    name: namePrefix + pk.name,
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

// 새 엔티티의 기본 위치 — 기존 엔티티들이 모여있는 영역(바운딩박스) 좌상단을 기준으로
// 4열 그리드(260×200px 간격)를 이어서 배치. 고정 원점(80,80)을 쓰면 엔티티들을 캔버스의
// 다른 위치로 옮겨둔 뒤 추가할 때 새 엔티티가 기존 모델링과 무관한 곳에 생성되던 문제가 있었음.
export function nextEntityPosition(doc: ErdDoc): NodePosition {
  const count = doc.entities.length + 1;
  const col = (count - 1) % 4;
  const row = Math.floor((count - 1) / 4);

  const positions = doc.entities
    .map(e => doc.nodePositions[e.id])
    .filter((p): p is NodePosition => !!p);
  const originX = positions.length ? Math.min(...positions.map(p => p.x)) : 80;
  const originY = positions.length ? Math.min(...positions.map(p => p.y)) : 80;

  return { x: originX + col * 260, y: originY + row * 200 };
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
  id?: string;               // 협업 시 피어 간 동일 id 재현용(미지정 시 새로 생성)
  name?: string;
  logicalName?: string;
  description?: string;
  color?: string;
  position?: NodePosition;
  withDefaultId?: boolean;   // 기본 id PK 컬럼 자동 추가 (기본 true)
  columns?: Column[];        // 지정 시 columns를 그대로 사용 (withDefaultId 무시)
}

export function addEntity(doc: ErdDoc, opts: AddEntityOptions = {}): { doc: ErdDoc; entityId: string } {
  const id = opts.id ?? genId();
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
  col: Partial<Column> = {}   // col.id 지정 시 협업 피어 간 동일 id 재현
): { doc: ErdDoc; columnId: string } {
  const newCol: Column = { ...DEFAULT_COLUMN, name: 'column', ...col, id: col.id ?? genId() };
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
  type: RelationshipType,
  sidesOverride?: Partial<RelationshipSides>,
  ids?: { relationshipId?: string; fkColumnIds?: string[] },  // 협업 시 피어 간 동일 id 재현
): { doc: ErdDoc; relationshipId: string | null; fkColumnsAdded: Column[] } {
  const sourceEntity = doc.entities.find(e => e.id === sourceId);
  const targetEntity = doc.entities.find(e => e.id === targetId);
  if (!sourceEntity || !targetEntity) {
    return { doc, relationshipId: null, fkColumnsAdded: [] };
  }
  // 생성 시점에 per-side를 확정해 명시 필드로 저장한다(type은 가장 근접한 enum으로 재계산).
  const sides: RelationshipSides = { ...sidesFromType(type), ...sidesOverride };
  // 자기 참조(재귀): FK명이 PK명과 동일해 충돌하므로 'parent_' 접두사로 회피
  const isSelfRef = sourceId === targetId;
  const newFKColumns = buildFKColumns(sourceEntity, sourceId, fkFlagsForSides(sides), isSelfRef ? 'parent_' : '', ids?.fkColumnIds);
  const fkNames = new Set(newFKColumns.map(c => c.name));
  const relationshipId = ids?.relationshipId ?? genId();
  const newRel: Relationship = {
    id: relationshipId,
    sourceId,
    targetId,
    type: sidesToType(sides),
    parentOptional: sides.parentOptional,
    childOptional: sides.childOptional,
    childCardinality: sides.childCardinality,
    identifying: sides.identifying,
  };
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
      relationships: [...doc.relationships, newRel],
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

// 관계 per-side(좌/우 절반) 부분 갱신 — 명시 필드를 머지하고 호환 type을 재계산하며,
// 자식 FK 플래그(isPK/isNN)도 새 side에 맞춰 갱신한다(updateRelationshipType과 동일한
// "기존 auto-FK는 플래그만 전환, 없으면 새로 생성" 규칙으로 컬럼명/논리명 보존).
export function updateRelationshipSides(
  doc: ErdDoc,
  id: string,
  partial: Partial<RelationshipSides>
): { doc: ErdDoc; changed: boolean } {
  const rel = doc.relationships.find(r => r.id === id);
  if (!rel) return { doc, changed: false };
  const sourceEntity = doc.entities.find(e => e.id === rel.sourceId);
  if (!sourceEntity) return { doc, changed: false };

  const updatedRel = applySides(rel, partial);
  const flags = fkFlagsForSides(deriveSides(updatedRel));
  const entities = doc.entities.map(e => {
    if (e.id !== rel.targetId) return e;
    const hasAutoFK = e.columns.some(c => c.isFK && c.refEntityId === rel.sourceId);
    if (hasAutoFK) {
      return {
        ...e,
        columns: e.columns.map(c =>
          c.isFK && c.refEntityId === rel.sourceId ? { ...c, isPK: flags.isPK, isNN: flags.isNN } : c
        ),
      };
    }
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
      relationships: doc.relationships.map(r => (r.id === id ? updatedRel : r)),
    },
    changed: true,
  };
}

// 관계선 끝점 수동 부착 위치 설정 — anchor가 null이면 해당 끝의 앵커를 제거(자동 복귀).
// 순수 기하 변경이라 FK/컬럼 부수효과는 없다(updateRelationshipSides와 대비).
export function updateRelationshipAnchor(
  doc: ErdDoc,
  id: string,
  end: 'source' | 'target',
  anchor: EndpointAnchor | null,
): ErdDoc {
  return {
    ...doc,
    relationships: doc.relationships.map(r => {
      if (r.id !== id) return r;
      const next: Relationship = { ...r };
      if (end === 'source') {
        if (anchor) next.sourceAnchor = anchor;
        else delete next.sourceAnchor;
      } else {
        if (anchor) next.targetAnchor = anchor;
        else delete next.targetAnchor;
      }
      return next;
    }),
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
