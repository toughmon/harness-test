# ERD MCP 서버

Claude Code(또는 다른 MCP 클라이언트)에서 **배포된 ERD 서비스의 다이어그램을 자연어로 생성·편집**하기 위한 MCP 서버입니다.

> **연결이 목적이라면 이 문서(stdio)가 아니라 원격 방식을 권장합니다.** 서버가 `/mcp`에 원격 HTTP MCP를 함께 호스팅하므로, 웹 좌측 사이드바 **MCP 연결**에서 개인 토큰(PAT)을 발급받아 `claude mcp add --transport http --header "Authorization: Bearer <PAT>" erd https://<도메인>/mcp` 한 줄이면 끝입니다(레포·Node·재시작 불필요). 자세히는 `public/mcp-guide.html`. 아래는 이 패키지를 **로컬 stdio**로 직접 실행하는 개발·디버깅 경로입니다. 두 방식 모두 같은 도구·로직(`src/core/erdOps`)을 공유합니다.

백엔드는 다이어그램을 JSON blob 단위로만 저장하므로(엔티티/컬럼 단위 API 없음), 이 서버는 매 변형마다 **`GET blob → 순수 로직(erdOps) 적용 → PUT blob`** 방식으로 동작합니다. 변형 로직은 프론트엔드와 동일한 [`../src/core/erdOps.ts`](../src/core/erdOps.ts)를 공유해 동작이 어긋나지 않습니다.

```
Claude Code ──stdio──> erd-mcp (이 패키지) ──https──> 배포된 ERD 서비스 (/api/*)
                          └─ import ../src/core/erdOps (프론트와 공유하는 순수 로직)
```

- **인증**: 서비스 계정으로 `/api/auth/login` → JWT 쿠키를 메모리에 보관 → 매 요청에 첨부, 401이면 1회 재로그인.
- **작업 대상**: `create_diagram`/`select_diagram`으로 "현재 다이어그램"을 정하면 이후 변형 도구가 그 다이어그램에 적용됩니다.

---

## 빠른 시작 — 로컬에서 먼저 테스트

배포 서버에 붙이기 전에 로컬 인스턴스로 동작을 확인하는 경로입니다.

```bash
# 1) ERD 서비스 빌드·기동 (DATABASE_URL 미설정 → pg-mem 인메모리)
cd erd-service
npm run build && npm start          # http://localhost:8080

# 2) MCP 의존성 설치
cd mcp
npm install

# 3) 서비스 계정 1회 생성 (로컬)
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"mcp-bot","password":"mcp-bot-secret-123"}'

# 4) e2e 검증으로 전 구간 확인 (도구 호출 → 저장 → 브라우저 렌더)
BASE_URL=http://localhost:8080 ERD_USERNAME=mcp-bot ERD_PASSWORD=mcp-bot-secret-123 node verify_mcp.mjs
```

`24항목 ALL PASS`가 나오면 서버 코드와 도구가 정상입니다. 이제 Claude Code에 등록하면 됩니다(아래).

---

## 배포 서버 연결 (Claude Code)

### 1) 서비스 계정 준비 (배포 서버에 1회)

MCP 전용 계정을 배포 서버에 가입시킵니다(일반 회원가입과 동일).

```bash
curl -X POST https://your-erd-domain.example.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"mcp-bot","password":"<강력한-비밀번호>"}'
```

> 이 계정이 소유한 다이어그램만 MCP에서 보이고 편집됩니다(사용자 격리). 사람이 쓰는 계정과 분리하길 권장합니다.

### 2) `.mcp.json` 작성

`.mcp.json.example`을 **프로젝트 루트**(`C:/project/harness-test/.mcp.json`)로 복사하고 값을 채웁니다.

```json
{
  "mcpServers": {
    "erd": {
      "command": "npx",
      "args": ["-y", "tsx", "erd-service/mcp/src/index.ts"],
      "env": {
        "ERD_BASE_URL": "https://your-erd-domain.example.com",
        "ERD_USERNAME": "mcp-bot",
        "ERD_PASSWORD": "<강력한-비밀번호>"
      }
    }
  }
}
```

CLI로도 등록 가능합니다:

```bash
claude mcp add erd \
  --env ERD_BASE_URL=https://your-erd-domain.example.com \
  --env ERD_USERNAME=mcp-bot \
  --env ERD_PASSWORD=<강력한-비밀번호> \
  -- npx -y tsx erd-service/mcp/src/index.ts
```

### 3) 연결 확인

Claude Code를 재시작한 뒤:

- `/mcp` 입력 → `erd` 서버와 도구 목록이 보이면 연결 성공.
- 또는 Claude에게 "ERD 다이어그램 목록 보여줘"(→ `list_diagrams`)라고 요청.

### 환경변수

| 변수 | 필수 | 설명 |
|------|:---:|------|
| `ERD_BASE_URL` | △ | 서비스 주소. 배포 서버는 **https**(쿠키 `secure`). 미설정 시 `http://localhost:8080` |
| `ERD_USERNAME` | ✅ | MCP 서비스 계정 아이디 |
| `ERD_PASSWORD` | ✅ | 비밀번호 (**`.mcp.json`을 커밋하지 말 것**) |
| `ERD_DIAGRAM_ID` | ✕ | 시작 시 현재 다이어그램으로 미리 선택할 id |

---

## 도구 레퍼런스

참조 인자(`entity`, `column`, `source`, `target`)는 **id 또는 이름** 둘 다 받습니다. 이름이 중복되면 id를 쓰라는 에러를 반환합니다.

| 도구 | 설명 |
|------|------|
| `list_diagrams` | 내 다이어그램 목록 |
| `create_diagram` | 빈 다이어그램 생성 + 현재 선택 |
| `select_diagram` | 작업 대상 선택 (`diagram_id` 또는 `name`) |
| `get_diagram` | 현재/지정 다이어그램 요약(`raw:true`면 원본 포함) |
| `rename_diagram` / `delete_diagram` | 이름 변경 / 삭제 |
| `add_entity` | 엔티티 추가(기본 `id` PK 포함) |
| `update_entity` / `delete_entity` | 수정 / 삭제(연쇄 FK·관계 정리) |
| `add_column` / `update_column` / `delete_column` | 컬럼 CRUD |
| `add_relationship` | 관계 추가 + 상위 PK를 하위 FK로 자동 생성 |
| `update_relationship_type` | 관계 타입 변경(식별↔비식별, FK 플래그 전환) |
| `delete_relationship` | 관계 삭제 + 자동 FK 제거 |

관계 타입 8종: `ONE_TO_MANY_IDENTIFYING`(식별, 점선+실선), `..._IDENTIFYING_SOLID`(실선+실선), `..._NON_IDENTIFYING`(비식별), `..._OPTIONAL`(NULL 허용), 그리고 `ONE_TO_ONE_*` 4종.

### 사용 예 (Claude에게 자연어로)

> "주문 시스템 ERD 새로 만들고, User(사용자)와 Order(주문) 엔티티를 추가해. User의 PK는 user_id로 바꾸고, User→Order 1:M 비식별 관계를 연결해줘."

Claude가 `create_diagram → add_entity ×2 → update_column → add_relationship` 순으로 호출하고, 상위 PK가 하위에 FK로 자동 생성됩니다.

---

## 문제 해결

| 증상 | 원인 / 해결 |
|------|------------|
| Claude Code에 `erd` 도구가 안 보임 | `.mcp.json`이 **프로젝트 루트**에 있는지, Claude Code를 재시작했는지 확인. `/mcp`로 상태 확인 |
| `로그인 실패 (HTTP 401)` | `ERD_USERNAME`/`ERD_PASSWORD` 확인, 배포 서버에 그 계정이 **가입돼 있는지** 확인 |
| `로그인 응답에 token 쿠키가 없습니다` | 배포 서버는 쿠키가 `secure` → `ERD_BASE_URL`이 **https**인지 확인(http로 실서버 접속 시 쿠키 누락) |
| `ERD_USERNAME / ERD_PASSWORD 환경변수가 필요합니다` | `.mcp.json`의 `env`가 비어 있음 |
| `Cannot find module` / `tsx` 못 찾음 | `cd erd-service/mcp && npm install` 실행 여부 확인 |
| 첫 실행이 느림 | `npx -y tsx`가 tsx를 받아오는 중(최초 1회) |
| MCP로 편집했는데 브라우저에 안 보임 | **설계상 정상** — 다이어그램을 다시 열거나 새로고침 필요(아래 주의) |

---

## 주의사항

- **새로고침 필요**: MCP 편집은 DB에 기록됩니다. 이미 열려 있는 브라우저에는 자동 반영되지 않으니, 다이어그램을 다시 열거나 새로고침하세요. (라이브 싱크는 MVP 범위 밖)
- **마지막 저장 우선(last-writer-wins)**: 같은 다이어그램을 MCP와 브라우저에서 동시에 저장하면 나중 저장이 앞 저장을 덮어씁니다.
- **PK 소급 미반영**: 컬럼의 PK 여부를 바꿔도 이미 만들어진 FK에는 소급 적용되지 않습니다(프론트엔드 동작과 동일).
- **서브타입(SubSet)·일괄 생성**은 이번 MVP 범위 밖입니다.

---

## 검증

`verify_mcp.mjs`는 MCP SDK 클라이언트로 이 서버를 stdio로 띄워 도구를 호출하고, 저장된 blob에 FK 자동생성/플래그 전환/연쇄 삭제가 반영됐는지 검증한 뒤, 브라우저로 다이어그램이 렌더되는지까지 확인합니다(24항목). 실행법은 위 [빠른 시작](#빠른-시작--로컬에서-먼저-테스트) 참고.
