---
name: erd-db
description: "ERD 서비스 자체 데이터베이스 스키마 설계, users/projects/diagrams/versions 테이블 설계, ERD JSON 저장 전략, 마이그레이션 스크립트, 인덱스 최적화. ERD 서비스 DB 설계, 스키마 마이그레이션, 데이터 모델 구현 요청 시 반드시 이 스킬을 사용할 것."
---

# ERD 서비스 DB 설계 스킬

## 목표
ERD 서비스가 사용하는 데이터베이스(메타-DB)의 스키마를 설계하고 마이그레이션을 구성한다. 사용자가 그리는 ERD 자체를 저장하는 DB다.

## 핵심 설계 결정: ERD 저장 전략

### 옵션 A: JSONB 통합 저장 (권장)
```sql
CREATE TABLE diagrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  schema JSONB NOT NULL DEFAULT '{}',  -- 전체 ERD JSON
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
**장점**: 스키마 변경에 유연, 쿼리 단순, ERD 구조 그대로 저장
**단점**: DB에서 특정 엔티티 검색 불가 (애플리케이션 레벨에서 처리)

→ ERD 조회가 항상 전체 다이어그램 단위이므로 JSONB가 최적

### 옵션 B: 정규화 분리 저장 (대안)
- entities, columns, relationships 테이블로 분리
- 복잡도 높음, ERD 검색/분석이 필요한 경우에만 고려

## 전체 테이블 스키마

```sql
-- 사용자
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),  -- OAuth 사용자는 NULL
  name VARCHAR(100),
  avatar_url TEXT,
  provider VARCHAR(50),        -- 'local', 'google', 'github'
  provider_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 프로젝트 (ERD 그룹)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 다이어그램 (실제 ERD)
CREATE TABLE diagrams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  schema JSONB NOT NULL DEFAULT '{"version":"1.0","entities":[],"relationships":[]}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 버전 스냅샷
CREATE TABLE diagram_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id UUID REFERENCES diagrams(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  schema JSONB NOT NULL,
  message VARCHAR(255),        -- 버전 메모 (선택)
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(diagram_id, version_number)
);

-- 공유 링크
CREATE TABLE diagram_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id UUID REFERENCES diagrams(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  is_public BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,      -- NULL = 만료 없음
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 프로젝트 협업자 (팀 기능)
CREATE TABLE project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'editor',  -- 'owner', 'editor', 'viewer'
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);
```

## 인덱스 전략

```sql
-- 사용자별 프로젝트 목록 조회 (가장 빈번)
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_updated ON projects(updated_at DESC);

-- 프로젝트별 다이어그램 목록
CREATE INDEX idx_diagrams_project ON diagrams(project_id);

-- 버전 조회
CREATE INDEX idx_versions_diagram ON diagram_versions(diagram_id, version_number DESC);

-- 공유 링크 토큰 조회 (매 공유 URL 접근마다 실행)
CREATE INDEX idx_shares_token ON diagram_shares(token);

-- JSONB 인덱스 (특정 엔티티명 검색 시 선택 추가)
-- CREATE INDEX idx_diagram_schema ON diagrams USING GIN(schema);
```

## 버전 관리 전략

```
스냅샷 방식 (권장 MVP):
- 사용자가 명시적으로 "버전 저장" 시 diagram_versions에 전체 스냅샷
- 자동 저장(auto-save)은 diagrams.schema만 업데이트
- 버전 복구: diagrams.schema = 해당 버전 스냅샷으로 덮어쓰기
```

## Prisma 스키마

```prisma
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String?
  name         String?
  provider     String    @default("local")
  projects     Project[]
  createdAt    DateTime  @default(now())
}

model Project {
  id        String    @id @default(uuid())
  ownerId   String
  owner     User      @relation(fields: [ownerId], references: [id])
  name      String
  diagrams  Diagram[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Diagram {
  id        String             @id @default(uuid())
  projectId String
  project   Project            @relation(fields: [projectId], references: [id])
  name      String
  schema    Json               @default("{}")
  versions  DiagramVersion[]
  shares    DiagramShare[]
  updatedAt DateTime           @updatedAt
  createdAt DateTime           @default(now())
}
```

## 산출물 위치
`_workspace/04_db/`에 위 스키마와 마이그레이션 파일을 저장한다.
