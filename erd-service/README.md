# YourERD (erd-service)

온라인 ERD(Entity-Relationship Diagram) 작성 서비스.
브라우저에서 엔티티·관계를 시각적으로 편집하고, 로그인하면 다이어그램을 사용자별로 DB에 저장할 수 있다.

![screenshot](ss_backend.png)
## 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프론트엔드 | React 19 + TypeScript + Vite 8 | SPA, 라우터 미사용 |
| 캔버스 | @xyflow/react (React Flow 12) | 노드/엣지 렌더링, 커스텀 노드·엣지 |
| 상태 관리 | zustand 5 | 스토어 4개로 관심사 분리 (아래) |
| 스타일 | Tailwind CSS 4 | M3 다크 팔레트 토큰 (`index.css` @theme) |
| 자동 정렬 | @dagrejs/dagre | 관계 구조 기반 레이아웃 |
| PNG 내보내기 | html-to-image | |
| 백엔드 | Fastify 5 (Node 22, ESM) | 단일 프로세스가 정적 파일 + API 모두 서빙 |
| DB | PostgreSQL (`pg`) | ORM 없음. `DATABASE_URL` 미설정 시 pg-mem 인메모리 폴백(개발/QA) |
| 인증 | JWT(@fastify/jwt) httpOnly 쿠키 + node:crypto scrypt 해싱 | 외부 의존성 최소화 |
| e2e 테스트 | Playwright | `verify_*.mjs` 스크립트 |

## 시스템 구조

```
브라우저 SPA (React) ──/api/*──> Fastify (server/index.js, :8080) ──> PostgreSQL
                      └─정적──> dist/ (빌드 결과물)
```

- **단일 Node 프로세스**: 정적 서빙과 API가 같은 오리진 → CORS/프록시 불필요 (dev는 vite proxy `/api` → :8080)
- **비로그인 사용 가능**: 에디터 전체 기능을 익명으로 사용. 로그인하면 DB 저장 기능이 추가 활성화

### 공개 경로

Vite 멀티페이지 빌드(`index.html` + `app.html`)라 루트는 정적 HTML, 편집기는 별도 진입점이다.
검색엔진·광고 심사 크롤러가 루트에서 읽을 실제 콘텐츠가 있어야 하기 때문이다.

| 경로 | 내용 |
|------|------|
| `/` | 정적 랜딩 페이지 (`index.html`) — 서비스 소개·기능·FAQ |
| `/en/` | 영문 랜딩 페이지 |
| `/app`, `/app/*` | 편집기 SPA (`app.html`) |
| `/d/:token` | 공유 링크 진입 — 앱 셸로 서빙 |
| `/manual.html`, `/mcp-guide.html`, `/prompt-guide.html` | 가이드 (각 `/en/` 사본 존재) |
| `/privacy.html`, `/terms.html` | 개인정보처리방침·이용약관 (각 `/en/` 사본 존재) |
| `/robots.txt`, `/sitemap.xml`, `/ads.txt` | 크롤러·광고 검증용 정적 파일 |
| `/api/*` | JSON API. fallback 대상 아님 — 미정의 경로는 404 JSON |
| 그 외 | **진짜 404** (`dist/404.html`) |

> **앱 셸 fallback 범위는 두 곳을 함께 고쳐야 한다.** 클라이언트 라우트 판정 정규식이
> `vite.config.ts`(dev)와 `server/index.js`(프로덕션)에 각각 있어서, 한쪽만 넓히면
> dev에서만 통과하고 배포 후 404가 나는 어긋남이 생긴다.
> 예전에는 `/api/*`를 뺀 모든 경로가 `index.html`을 200으로 반환해(soft 404)
> 존재하지 않는 URL이 무한히 유효한 페이지로 보였다.

### 디렉토리 구조

```
erd-service/
├── server/                  # 백엔드 (Fastify)
│   ├── index.js             # 부트스트랩: env→DB→인증→라우트→정적 서빙
│   ├── db.js                # pg Pool 또는 pg-mem 폴백, 스키마 자동 생성(idempotent DDL)
│   ├── auth-routes.js       # /api/auth — 가입/로그인/로그아웃/세션확인, scrypt 해싱
│   └── diagram-routes.js    # /api/diagrams — CRUD, JWT 필수 + 소유권 검증
├── src/
│   ├── api/client.ts        # fetch 래퍼 (비2xx → ApiError throw)
│   ├── store/
│   │   ├── erdStore.ts      # 다이어그램 문서 상태 (엔티티/관계/위치) + Undo/Redo 히스토리
│   │   ├── authStore.ts     # 로그인 상태, 세션 복원(GET /me)
│   │   ├── diagramStore.ts  # DB 다이어그램 목록/현재 ID/dirty 추적 (erdStore subscribe)
│   │   └── dialogStore.ts   # 공용 alert/confirm/prompt 모달 (Promise 기반)
│   ├── components/
│   │   ├── toolbar/Toolbar.tsx        # GNB: Undo/Redo·DB 저장·JSON Save/Load·로그인 아바타
│   │   ├── sidebar/Sidebar.tsx        # 내 다이어그램 목록(로그인 시) + Entity List
│   │   ├── canvas/ERDCanvas.tsx       # React Flow 캔버스 + 줌 툴바(정렬/PNG)
│   │   ├── nodes/EntityNode.tsx       # 엔티티 노드 (PK 섹션 / 일반 컬럼 섹션 분리)
│   │   ├── edges/RelationshipEdge.tsx # Barker 표기 관계선 + 연결점 분산 + 선택 툴바
│   │   ├── panels/EntityEditPanel.tsx # 우측 Properties — 컬럼 편집·드래그 순서 변경
│   │   ├── panels/RelTypeModal.tsx    # 관계 종류 선택/변경 모달
│   │   ├── auth/AuthModal.tsx         # 로그인/가입 모달
│   │   └── common/DialogModal.tsx     # 공용 다이얼로그 렌더러
│   ├── utils/
│   │   ├── erdData.ts       # ERDData(저장 포맷) ↔ 스토어 상태 변환
│   │   ├── fileIO.ts        # JSON 파일 저장/불러오기
│   │   ├── autoLayout.ts    # dagre 자동 정렬
│   │   ├── exportImage.ts   # PNG 내보내기
│   │   └── edgeConnection.ts# 관계선 연결점 분산 계산
│   ├── core/erdOps.ts       # ERD 변형 순수 로직 (store·MCP 서버가 공유)
│   └── types/erd.ts         # Entity/Column/Relationship/ERDData 타입
├── mcp/                     # MCP 서버 — Claude Code에서 ERD 제어 (아래 "MCP 연동")
└── verify_*.mjs             # Playwright e2e (아래 QA 체계)
```

## 데이터 모델

```ts
Entity       { id, name(물리명), logicalName?(논리명), description?, color, columns: Column[] }
Column       { id, name, logicalName?, type, size, isPK, isFK, isNN, isUnique, refEntityId?, refColumnId? }
Relationship { id, sourceId(상위), targetId(하위), type }
ERDData      { version: "1.0", entities: { entity, position }[], relationships }  // 저장 포맷
```

- `ERDData`는 JSON 파일 저장과 DB 저장(`diagrams.data` JSONB)에 동일하게 사용
- 관계 타입(8종): `1:M`·`1:1` 각각 `IDENTIFYING`(식별, 점선+실선) / `IDENTIFYING_SOLID`(식별, 실선+실선) / `NON_IDENTIFYING`(비식별, 점선+실선) / `OPTIONAL`(비식별, 점선+점선·NULL 허용) — 예: `ONE_TO_MANY_IDENTIFYING`, `ONE_TO_ONE_OPTIONAL`. SOLID는 렌더링(전체 실선)만 다르고 FK 플래그는 일반 식별과 동일

### FK 자동 생성 규칙

관계 연결 시 상위 엔티티의 PK가 하위 엔티티에 FK 컬럼으로 자동 생성된다. 컬럼명은 **상위 PK명 그대로**(엔티티명 접두사 없음), 논리명도 **상위 PK 논리명 그대로** 가져온다. 하위에 같은 이름의 컬럼이 이미 있으면 그 컬럼을 FK로 교체한다(단, 다른 관계로 생성된 FK는 보존 — `verify_fk_namedup`).

| 관계 타입 | FK 생성 | PK(식별자) 포함 | NOT NULL |
|---|:---:|:---:|:---:|
| 식별 / 식별-SOLID (1:M, 1:1) | O | O | O |
| 비식별 (1:M, 1:1) | O | X | O |
| 선택 OPTIONAL (1:M, 1:1) | O | X | X (NULL 허용) |

- 관계 **타입 변경** 시 FK 플래그만 전환 (PK 승격/해제 — 사용자가 수정한 컬럼명 보존)
- 관계/상위 엔티티 **삭제** 시 자동 생성된 FK도 함께 제거 (`refEntityId` 기준), Undo로 복원 가능

### 편집 기능

- 엔티티/컬럼 CRUD, 컬럼 드래그 순서 변경, 노드 드래그 배치, 색상
- 관계선 드래그 연결(Barker 표기, 연결점 분산), 타입 변경, 삭제
- Undo/Redo (Ctrl+Z/Y, 연속 입력 800ms 병합, 상한 50)
- dagre 자동 정렬, PNG 내보내기, JSON 파일 저장/불러오기 (비로그인 포함)
- 파괴적 동작(삭제/미저장 이탈)은 공용 확인 모달 사용

## API 명세

공통: JSON, 인증은 httpOnly 쿠키 `token`(JWT, 7일). 실패 시 `401 {error:"Unauthorized"}`.

| Method | Path | Body | 성공 | 에러 |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{username, password}` | `201 {id, username}` + 쿠키 | `400` 형식, `409 username_taken` |
| POST | `/api/auth/login` | `{username, password}` | `200 {id, username}` + 쿠키 | `401 invalid_credentials` |
| POST | `/api/auth/logout` | — | `200 {ok}` | — |
| GET | `/api/auth/me` | — | `200 {id, username}` | `401` |
| GET | `/api/diagrams` | — | `200 [{id, name, updated_at}]` (data 제외) | `401` |
| POST | `/api/diagrams` | `{name, data}` | `201 {id, name, updated_at}` | `400`, `401` |
| GET | `/api/diagrams/:id` | — | `200 {id, name, data, updated_at}` | `401`, `404` |
| PUT | `/api/diagrams/:id` | `{name?, data}` | `200` (name은 전달 시만 변경) | `400`, `401`, `404` |
| PATCH | `/api/diagrams/:id` | `{name}` | `200` 이름 변경 | `400`, `401`, `404` |
| DELETE | `/api/diagrams/:id` | — | `200 {ok}` | `401`, `404` |

- username: 3~50자, `[a-zA-Z0-9_.-]` / password: 8자 이상
- 모든 다이어그램 접근은 `user_id` 소유권 검증 (타인 것은 404)

## DB 스키마

서버 첫 기동 시 자동 생성 (`CREATE TABLE IF NOT EXISTS`, 마이그레이션 도구 없음).

```sql
users    (id SERIAL PK, username VARCHAR(50) UNIQUE, pw_hash VARCHAR(255), created_at)
diagrams (id SERIAL PK, user_id INT FK→users ON DELETE CASCADE,
          name VARCHAR(120), data JSONB, created_at, updated_at)
-- INDEX idx_diagrams_user ON diagrams(user_id)
```

## 환경변수 (.env — git 제외, `.env.example` 참고)

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | `postgresql://user:pw@localhost:5432/erd_service` — **미설정 시 pg-mem 인메모리로 동작 (재시작 시 데이터 소실, 개발/QA 전용)** |
| `JWT_SECRET` | 토큰 서명 키 (`openssl rand -hex 32` 권장). 미설정 시 dev 기본값 + 경고 |
| `PORT` / `HOST` | 기본 8080 / 0.0.0.0 |

## 실행

```bash
# 개발 (터미널 2개) — DATABASE_URL 없이 pg-mem으로 띄우려면 ALLOW_PGMEM=1 필수(없으면 기동 거부)
npm run dev                    # Vite :5173 (API는 :8080으로 프록시)
ALLOW_PGMEM=1 npm start        # Fastify :8080

# 프로덕션 (DATABASE_URL 설정 시 ALLOW_PGMEM 불필요)
npm ci && npm run build && npm start
```

> 서버는 원격 MCP 브리지(`mcp/src/httpServer.ts`, TS)를 런타임에 `tsx`의 `tsImport`로 로드하므로 **plain `node server/index.js`로 그대로 뜬다**(별도 `--import` 플래그 불필요). `tsx`·`@modelcontextprotocol/sdk`·`zod`가 루트 의존성에 포함돼 있어 **루트 `npm install`(또는 `npm ci`) 한 번**이면 충분하다(`mcp/`를 따로 설치할 필요 없음). 단일 Node 프로세스 구성 유지.

### 배포 (Ubuntu + pm2)

> ⚠ **반드시 `DATABASE_URL`(영속 PostgreSQL)을 설정할 것.** 미설정 시 pg-mem 인메모리로 떠서
> `pm2 restart`/재배포 때마다 **계정·MCP 토큰·저장된 다이어그램이 전부 삭제**된다(= MCP가 `failed`로
> 뜨고 토큰을 매번 새로 발급해야 하는 원인). 서버는 `.env`를 **프로덕션에서도 로드**하며,
> **영속 DB가 없으면 항상 기동을 거부**한다(`NODE_ENV` 설정 여부와 무관 — pm2가 `NODE_ENV=production`을
> 세팅해주지 않으면 예전 가드는 조용히 무력화됐다; 의도적 pg-mem 허용은 `ALLOW_PGMEM=1`).
> 현재 어떤 DB로 떠 있는지는 `curl localhost:8080/api/health` → `{"ok":true,"db":"pg"}`로 확인.

```bash
cd /tough/app/harness-test/erd-service
git pull
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci   # 의존성 변경 시 (tsx·sdk·zod 포함)
npm run build
# 최초 1회: .env에 DATABASE_URL=postgresql://... 와 JWT_SECRET 설정 (.env.example 참고)
pm2 restart erd --update-env                # 최초: pm2 start server/index.js --name erd && pm2 save
pm2 logs erd --lines 20                     # "영속 DB 연결됨 (kind=pg)" / "Server listening" 확인
curl -s localhost:8080/api/health           # {"ok":true,"db":"pg"} — pg-mem이면 즉시 조치
```

앱은 8080 포트에만 리스닝하므로, 도메인 연결(브라우저에서 `http(s)://<도메인>`으로 접속) 및 HTTPS 설정에는 nginx 리버스 프록시 + certbot이 추가로 필요하다. 절차는 **[`DEPLOY_SSL.md`](DEPLOY_SSL.md)** 참고.

## MCP 연동 (Claude Code)

Claude Code에서 **배포된 이 서비스의 다이어그램을 자연어로 생성·편집**할 수 있는 MCP 서버를 제공한다. 두 가지 연결 방식이 있으며 도구 15종(다이어그램 CRUD + 엔티티/컬럼/관계 CRUD + FK 자동생성, 참조는 id·이름 모두 허용)은 공통이다. 변형은 매번 `GET blob → 공유 로직(src/core/erdOps) 적용 → PUT blob`(백엔드 blob CRUD 그대로).

### 원격 HTTP + 개인 토큰 (권장 — 원클릭)

서버가 `/mcp`에 StreamableHTTP MCP 엔드포인트를 함께 호스팅한다. 사용자는 웹 좌측 사이드바 **MCP 연결**에서 개인 토큰(PAT)을 발급받아 명령 한 줄만 붙여넣으면 된다(레포·Node·재시작 불필요).

```
Claude Code ──HTTP(Bearer PAT)──> /mcp ──(요청 사용자 단기 JWT)──> /api/diagrams
```

```bash
# --header 는 가변인자라 반드시 name·url 뒤(맨 끝)에 둔다
claude mcp add --transport http erd https://<도메인>/mcp --header "Authorization: Bearer <PAT>"
```

- 인증: `Authorization: Bearer erdmcp_…`(PAT) → `mcp_tokens`(sha256 해시 저장) 조회 → 해당 사용자로 동작. 서비스계정 불필요, 사용자별 격리 유지. PAT 발급/취소는 `/api/mcp-tokens`.
- 구현: `mcp/src/httpServer.ts`(Fastify에 `/mcp` 마운트, 세션별 transport), 요청 컨텍스트는 `reqCtx`(AsyncLocalStorage)로 도구에 전달.

### 로컬 stdio (개발·디버깅)

```
Claude Code ──stdio──> erd-service/mcp ──https(JWT 쿠키)──> /api/diagrams
```

- 서비스 계정으로 `/api/auth/login` → 쿠키 보관 + 401 재로그인. `cd mcp && npm install` 후 `.mcp.json`에 등록.

편집은 DB에 반영되며, **이미 열린 브라우저는 재오픈/새로고침 시 반영**(라이브 싱크 미포함).

설치·서비스 계정 등록·`.mcp.json` 작성·문제 해결은 **[`mcp/README.md`](mcp/README.md)** 참고. 등록 예시는 `mcp/.mcp.json.example`.

## QA 체계 (Playwright e2e)

서버 기동 후 `node verify_<이름>.mjs` 실행. `BASE_URL` env 지원 (기본은 스크립트별 5174 또는 8080).
코드 변경 시 영향권 스크립트 재실행이 관례 (루트 CLAUDE.md의 유지보수 QA 절차 참고).

| 스크립트 | 검증 대상 |
|---|---|
| verify_server | 프로덕션 서버 — 정적 서빙·랜딩/앱 라우팅·404 처리·/api 404 |
| verify_seo | 랜딩·정책 페이지, robots/sitemap, 소프트404 제거, 메타태그 |
| verify_backend | 가입→DB저장→세션복원→열기·모달·401/409 (24항목) |
| verify_features | Undo/Redo·관계 타입 변경·자동 정렬·PNG (14항목) |
| verify_fk_cleanup | 엔티티/관계 삭제 시 FK 정리, 비식별 FK (13항목) |
| verify_fk_namedup | FK명이 하위 컬럼과 충돌 시 교체 처리 (식별/비식별 상속) |
| verify_column_drag | 컬럼 드래그 순서 변경 (5항목) |
| verify_logical | 논리명/물리명 병기·FK 논리명 자동 조합 |
| verify_design | YourERD 레이아웃·관계·FK |
| verify_sidebar_cleanup / verify_gnb_cleanup | 사이드바·GNB 정리 회귀 |
| verify_erd / verify_barker / verify_fanout | (구버전 — 디자인 개편 이전 UI 기준, 동작 불가) |
| mcp/verify_mcp | MCP 서버 — stdio 도구 호출→저장 blob FK 검증→브라우저 렌더 (24항목, `mcp/`에서 실행) |

변경 이력은 루트 `CLAUDE.md`의 변경 이력 테이블에 기록한다.
