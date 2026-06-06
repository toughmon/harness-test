---
name: erd-frontend
description: "ERD 캔버스 UI 구현, 노드/엣지 편집 컴포넌트, 실시간 다이어그램 렌더링, React Flow 기반 ERD 편집기, 엔티티/관계 편집 패널, SQL DDL 내보내기 UI 구현. ERD 프론트엔드 개발, 캔버스 컴포넌트, UI 구현 요청 시 반드시 이 스킬을 사용할 것."
---

# ERD 프론트엔드 구현 스킬

## 목표
React Flow 기반 ERD 편집 캔버스와 편집 UI를 구현하여 사용자가 직관적으로 ERD를 작성할 수 있게 한다.

## 기술 스택 (architect-agent 확정 기준)
- **React** + TypeScript
- **React Flow** — 캔버스 라이브러리
- **Zustand** — ERD 상태 관리
- **Tailwind CSS** — 스타일링
- **Yjs** — 실시간 협업 (선택)

## 핵심 컴포넌트 구조

```
src/
├── components/
│   ├── canvas/
│   │   ├── ERDCanvas.tsx          # React Flow 루트 컴포넌트
│   │   ├── nodes/
│   │   │   └── EntityNode.tsx     # 엔티티 박스 노드
│   │   └── edges/
│   │       └── RelationshipEdge.tsx  # 관계선 (카디날리티 표시)
│   ├── panels/
│   │   ├── EntityEditPanel.tsx    # 엔티티/컬럼 편집 사이드패널
│   │   └── RelationshipPanel.tsx  # 관계 설정 패널
│   └── toolbar/
│       └── ERDToolbar.tsx         # 엔티티 추가, 내보내기 버튼
├── hooks/
│   ├── useERD.ts                  # ERD 상태 CRUD 훅
│   ├── useERDExport.ts            # SQL/PNG/SVG 내보내기
│   └── useCollaboration.ts        # Yjs 실시간 협업 훅
├── store/
│   └── erdStore.ts                # Zustand ERD 상태
└── types/
    └── erd.ts                     # ERD 타입 정의
```

## 타입 정의 (백엔드와 공유)

```typescript
// types/erd.ts
export interface ERDSchema {
  version: string;
  entities: Entity[];
  relationships: Relationship[];
}

export interface Entity {
  id: string;
  name: string;
  position: { x: number; y: number };
  columns: Column[];
}

export interface Column {
  id: string;
  name: string;
  type: string;
  constraints: ColumnConstraint[];
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  nullable: boolean;
}

export type ColumnConstraint = 'PK' | 'FK' | 'UNIQUE' | 'NOT NULL' | 'INDEX';

export interface Relationship {
  id: string;
  label?: string;
  from: { entityId: string; columnId: string };
  to: { entityId: string; columnId: string };
  type: RelationshipType;
}

export type RelationshipType = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY';
```

## EntityNode 구현 가이드

```tsx
// EntityNode는 React Flow의 커스텀 노드
// 상단: 테이블명 (편집 가능)
// 하단: 컬럼 목록 (PK는 상단, FK는 아이콘 표시)
// Handle: 각 컬럼 우측에 연결 핸들 배치

const EntityNode = ({ data, id }: NodeProps<EntityNodeData>) => {
  // 더블클릭 → 편집 패널 열기
  // 컬럼 핸들 → 관계선 연결 시작
  // PK 컬럼: 황금색 배경, 열쇠 아이콘
  // FK 컬럼: 화살표 아이콘
};
```

## 성능 고려사항
- React Flow의 `nodesDraggable`, `edgesUpdatable`을 상황에 맞게 제어
- 엔티티 50개 이상: `miniMap` 필수, `fitView` 초기화 시 사용
- 컬럼이 많은 엔티티: 컬럼 수 제한 표시 + 스크롤 처리

## SQL DDL 내보내기

```typescript
// useERDExport.ts
export const generateSQL = (schema: ERDSchema): string => {
  // 1. FK 의존성 순서로 정렬
  // 2. CREATE TABLE 문 생성
  // 3. CONSTRAINT / REFERENCES 추가
  // 4. MANY_TO_MANY는 junction table 자동 생성
};
```

## API 연동 훅

```typescript
// useERD.ts
const useERD = (diagramId: string) => {
  // GET /api/diagrams/:id → 초기 로드
  // PUT /api/diagrams/:id → 자동 저장 (debounce 2s)
  // POST /api/diagrams/:id/export → 코드 생성 요청
};
```

## 산출물 위치
`_workspace/02_frontend/`에 위 구조대로 저장한다.
