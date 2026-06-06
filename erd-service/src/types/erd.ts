export const COLUMN_TYPES = [
  'VARCHAR', 'INT', 'BIGINT', 'BOOLEAN', 'TEXT',
  'DATE', 'DATETIME', 'TIMESTAMP', 'DECIMAL', 'FLOAT',
  'CHAR', 'SMALLINT', 'TINYINT', 'UUID', 'JSON', 'BLOB',
] as const;

export type ColumnType = typeof COLUMN_TYPES[number];

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  size: string;
  isPK: boolean;
  isFK: boolean;
  isNN: boolean;
  isUnique: boolean;
  refEntityId?: string;
  refColumnId?: string;
}

export interface Entity {
  id: string;
  name: string;
  color: string;
  columns: Column[];
}

export type RelationshipType =
  | 'ONE_TO_MANY_IDENTIFYING'
  | 'ONE_TO_MANY_NON_IDENTIFYING'
  | 'ONE_TO_MANY_OPTIONAL'
  | 'ONE_TO_ONE_IDENTIFYING'
  | 'ONE_TO_ONE_NON_IDENTIFYING';

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  ONE_TO_MANY_IDENTIFYING: '1:M  상속+식별자',
  ONE_TO_MANY_NON_IDENTIFYING: '1:M  비상속+비식별자',
  ONE_TO_MANY_OPTIONAL: '1:M  비상속+비식별',
  ONE_TO_ONE_IDENTIFYING: '1:1  상속+식별자',
  ONE_TO_ONE_NON_IDENTIFYING: '1:1  비상속+비식별',
};

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
}

export interface ERDData {
  version: string;
  entities: Array<{ entity: Entity; position: { x: number; y: number } }>;
  relationships: Relationship[];
}

export const ENTITY_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48', // rose
  '#a855f7', // purple
];
