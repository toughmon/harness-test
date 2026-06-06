---
name: erd-backend
description: "ERD 서비스 API 서버 구현, ERD 스키마 CRUD API, SQL DDL/ORM 코드 생성 엔진, WebSocket 실시간 협업, JWT 인증 API, 공유 링크 API 구현. ERD 백엔드 개발, API 구현, 코드 생성 기능 요청 시 반드시 이 스킬을 사용할 것."
---

# ERD 백엔드 구현 스킬

## 목표
ERD 스키마의 저장·조회·코드 생성·실시간 협업을 처리하는 API 서버를 구현한다.

## 기술 스택 (architect-agent 확정 기준)
- **Node.js + Fastify** — REST API
- **Socket.io** — WebSocket (실시간 협업)
- **Prisma** — ORM
- **JWT + bcrypt** — 인증
- **Zod** — 입력 유효성 검사

## API 엔드포인트 설계

### 인증
```
POST /api/auth/register    — 회원가입
POST /api/auth/login       — 로그인 (JWT 발급)
POST /api/auth/refresh     — 토큰 갱신
POST /api/auth/oauth/google — Google OAuth
```

### 프로젝트/다이어그램 CRUD
```
GET    /api/projects                — 내 프로젝트 목록
POST   /api/projects                — 프로젝트 생성
GET    /api/projects/:id/diagrams   — 다이어그램 목록
POST   /api/projects/:id/diagrams   — 다이어그램 생성
GET    /api/diagrams/:id            — 다이어그램 조회 (ERD JSON)
PUT    /api/diagrams/:id            — 다이어그램 저장 (자동저장)
DELETE /api/diagrams/:id            — 삭제
```

### 코드 생성
```
POST /api/diagrams/:id/export/sql        — SQL DDL 생성
POST /api/diagrams/:id/export/prisma     — Prisma Schema 생성
POST /api/diagrams/:id/export/typeorm    — TypeORM Entity 생성
POST /api/diagrams/:id/export/sqlalchemy — SQLAlchemy Model 생성
```

### 공유
```
POST   /api/diagrams/:id/share   — 공유 링크 생성
DELETE /api/diagrams/:id/share   — 공유 해제
GET    /api/share/:token          — 공유 링크로 ERD 조회 (공개)
```

### 버전 관리
```
GET  /api/diagrams/:id/versions     — 버전 목록
GET  /api/diagrams/:id/versions/:v  — 특정 버전 조회
POST /api/diagrams/:id/versions     — 현재 상태 스냅샷 저장
```

## 코드 생성 엔진 설계

```typescript
// generators/index.ts
interface CodeGenerator {
  generate(schema: ERDSchema): string;
}

class SQLGenerator implements CodeGenerator {
  generate(schema: ERDSchema): string {
    // 1. 위상 정렬 (FK 의존성 순서)
    // 2. CREATE TABLE 생성
    // 3. ALTER TABLE ADD CONSTRAINT (FK)
    // 4. MANY_TO_MANY → junction table
  }
}

class PrismaGenerator implements CodeGenerator {
  generate(schema: ERDSchema): string {
    // 1. model 블록 생성
    // 2. 관계 어노테이션 (@relation)
    // 3. 타입 매핑 (VARCHAR→String, INT→Int 등)
  }
}
```

## 타입 매핑 (DB 타입 → 각 ORM)

| ERD 타입 | SQL | Prisma | TypeORM | SQLAlchemy |
|---------|-----|--------|---------|-----------|
| UUID | UUID | String @id @default(uuid()) | uuid('id') | UUID |
| VARCHAR(n) | VARCHAR(n) | String @db.VarChar(n) | varchar(n) | String(n) |
| INT | INTEGER | Int | int() | Integer |
| BOOLEAN | BOOLEAN | Boolean | boolean() | Boolean |
| TIMESTAMP | TIMESTAMP | DateTime | timestamp() | DateTime |
| TEXT | TEXT | String | text() | Text |
| DECIMAL(p,s) | DECIMAL(p,s) | Decimal | decimal(p,s) | Numeric(p,s) |

## WebSocket 이벤트 프로토콜

```typescript
// 클라이언트 → 서버
'join-diagram': { diagramId: string, userId: string }
'leave-diagram': { diagramId: string }
'entity-move': { entityId: string, position: {x,y} }
'schema-update': { patch: JsonPatch }  // RFC 6902

// 서버 → 클라이언트
'user-joined': { userId: string, cursor: {x,y} }
'user-left': { userId: string }
'schema-updated': { patch: JsonPatch, authorId: string }
'cursor-moved': { userId: string, cursor: {x,y} }
```

## 입력 유효성 검사 (Zod)

```typescript
const ERDSchemaValidator = z.object({
  version: z.string(),
  entities: z.array(EntityValidator),
  relationships: z.array(RelationshipValidator),
});

// 모든 API 엔드포인트에서 Zod 검증 후 처리
// 검증 실패 시 400 + 상세 에러 메시지 반환
```

## 에러 응답 표준

```typescript
// 모든 에러는 다음 포맷으로 반환
interface APIError {
  code: string;      // 'ERD_INVALID_SCHEMA', 'DIAGRAM_NOT_FOUND' 등
  message: string;   // 사람이 읽는 설명
  details?: any;     // Zod 검증 에러 등 상세 정보
}
```

## 산출물 위치
`_workspace/03_backend/`에 저장한다.
