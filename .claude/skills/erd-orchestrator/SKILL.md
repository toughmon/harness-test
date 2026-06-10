---
name: erd-orchestrator
description: "온라인 ERD 작성 서비스 전체 구축을 조율하는 오케스트레이터. ERD 서비스 만들기, ERD 서비스 구축, ERD 서비스 개발 시작, 다시 실행, 재실행, ERD 서비스 업데이트, 수정, 보완, 이전 결과 기반으로 개선, 특정 부분만 다시 등 모든 ERD 서비스 관련 작업 요청 시 반드시 이 스킬을 사용할 것."
---

# ERD 서비스 오케스트레이터

## 실행 모드
**에이전트 팀** — architect, frontend, backend, db, qa 에이전트가 팀을 이루어 협업한다.

## Phase 0: 컨텍스트 확인 (매 실행 시 가장 먼저)

`_workspace/` 디렉토리와 실코드(`erd-service/`) 존재 여부를 확인하여 실행 모드를 결정한다:

```
_workspace/ 없음 + erd-service/ 실코드 있음
  → 유지보수 모드: 요청 범위만 직접 수정
  → 완료 전 "유지보수 모드 QA 절차 (필수)" 수행

_workspace/ 없음 + 실코드도 없음
  → 초기 실행: Phase 1부터 전체 수행

_workspace/ 있음 + 사용자가 전체 재작성 요청
  → 기존 _workspace를 _workspace_prev/로 이동 후 새 실행

_workspace/ 있음 + 사용자가 특정 부분만 수정 요청 (예: "백엔드만 다시")
  → 해당 에이전트만 재호출 (부분 재실행)
  → qa-agent는 변경된 경계면만 재검증
```

## 유지보수 모드 QA 절차 (필수)

실코드(`erd-service/`)를 변경하는 모든 작업은 완료 보고 전에 아래를 순서대로 수행한다.
이 절차는 생략할 수 없으며, 각 단계의 결과(PASS/FAIL)를 사용자 보고에 명시한다.

1. **빌드 검증**: `erd-service/`에서 `npm run build` (tsc + vite) 통과 확인. 실패 시 수정 후 재실행
2. **기능 e2e 검증**: 변경 기능에 대한 Playwright 스크립트를 `erd-service/verify_*.mjs` 패턴으로 작성/갱신하고 PASS 확인
   - dev 서버는 백그라운드 실행. 5173 포트 사용 중이면 Vite가 안내한 포트(예: 5174)를 사용
   - 기존 스크립트(`verify_erd / verify_barker / verify_fanout / verify_design / verify_logical.mjs`)의 헬퍼(drawRelationship 등)를 재사용
3. **회귀 확인**: 변경 영향권의 기존 `verify_*.mjs` 중 1개 이상 재실행하여 PASS 확인
4. **시각 확인**: 스크린샷(`ss_*.png`)을 찍어 직접 열어 확인 — 렌더링 결과를 텍스트 출력만으로 판정하지 않는다
5. **메뉴얼 업데이트**: 사용자에게 보이는 기능이 변경된 경우 `erd-service/public/manual.html`과 `erd-service/USER_MANUAL.md`를 수정한다
   - 해당: 새 기능 추가, 기존 기능 동작 변경, UI 레이블·버튼·단축키 변경
   - 생략 가능: 기능 영향 없는 리팩토링·버그 픽스·성능 개선
6. **이력 기록**: 프로젝트 루트 `CLAUDE.md`의 변경 이력 테이블에 1행 추가 (날짜 | 변경 내용 | 대상 | 사유)
7. **보고**: 검증 결과(PASS/FAIL)를 명시적으로 보고. 커밋/push는 사용자가 요청할 때만 수행

**QA 절차 중 FAIL 발생 시**: 원인을 수정한 뒤 해당 단계부터 재수행한다. 해결 불가하면 FAIL 상태와 원인을 그대로 보고한다 — 숨기거나 PASS로 포장하지 않는다.

## Phase 1: 요구사항 확인

사용자에게 다음을 확인한다 (모두 선택사항, 미응답 시 권장값 사용):

1. **기술 스택 선호도**: 특정 언어/프레임워크 선호가 있나요? (기본: Node.js + React + PostgreSQL)
2. **협업 기능**: 실시간 다중 사용자 편집이 MVP에 포함되어야 하나요? (기본: 선택사항으로 분리)
3. **코드 생성 대상**: SQL만? ORM도 포함? 어떤 ORM? (기본: SQL + Prisma + TypeORM)
4. **배포 환경**: SaaS로 배포? 자체 호스팅? (기본: SaaS 기준 설계)

## Phase 2: 팀 구성

```
TeamCreate("erd-team", [
  "architect",   // 아키텍처 설계
  "frontend",    // 캔버스 UI
  "backend",     // API 서버
  "db",          // DB 스키마
  "qa"           // 통합 검증
])
```

작업 할당:
```
TaskCreate("아키텍처 설계",    assignee="architect", deps=[])
TaskCreate("프론트엔드 구현",  assignee="frontend",  deps=["아키텍처 설계"])
TaskCreate("백엔드 API 구현",  assignee="backend",   deps=["아키텍처 설계"])
TaskCreate("DB 스키마 설계",   assignee="db",        deps=["아키텍처 설계"])
TaskCreate("통합 QA 검증",     assignee="qa",        deps=["프론트엔드 구현", "백엔드 API 구현", "DB 스키마 설계"])
```

## Phase 3: 아키텍처 설계

**architect-agent 실행** (erd-architect 스킬 사용)
- 기술 스택 결정, 시스템 구조, 디렉토리 뼈대, API 엔드포인트 목록 생성
- 산출물: `_workspace/01_architect_design.md`

완료 후 팀원들에게 설계 문서 위치 공유:
```
SendMessage("frontend", "아키텍처 설계 완료: _workspace/01_architect_design.md 읽고 구현 시작")
SendMessage("backend",  "아키텍처 설계 완료: _workspace/01_architect_design.md 읽고 구현 시작")
SendMessage("db",       "아키텍처 설계 완료: _workspace/01_architect_design.md 읽고 구현 시작")
```

## Phase 4: 병렬 구현

frontend, backend, db 에이전트가 동시에 작업한다. 각 에이전트는 architect 산출물을 읽고 시작한다.

**병렬 실행:**
- `frontend-agent` (erd-frontend 스킬) → `_workspace/02_frontend/`
- `backend-agent` (erd-backend 스킬) → `_workspace/03_backend/`
- `db-agent` (erd-db 스킬) → `_workspace/04_db/`

**에이전트 간 통신 (자체 조율):**
- frontend ↔ backend: API 스펙 공유 (`_workspace/03_backend/routes.md`)
- backend ↔ db: DB 스키마 공유 (`_workspace/04_db/schema.prisma`)

**점진적 QA**: 각 에이전트 완료 시 qa-agent가 즉시 해당 경계면 검증
```
backend 완료 → qa: "경계면 1(프론트↔백엔드) 타입 검증 시작"
db 완료     → qa: "경계면 2(백엔드↔DB) 검증 시작"
```

## Phase 5: 통합 QA 검증

**qa-agent 실행** (erd-qa 스킬 사용)
- 전체 경계면 최종 검증
- 산출물: `_workspace/05_qa_report.md`

불일치 발견 시:
```
qa → 해당 에이전트: "수정 필요: [경계면] [상세 내용]"
해당 에이전트 수정 후 qa 재검증
```

## Phase 6: 산출물 종합

모든 에이전트 작업 완료 후 사용자에게 보고:

```markdown
## ERD 서비스 구축 완료

### 기술 스택
[architect 산출물 요약]

### 생성된 파일 구조
_workspace/
├── 01_architect_design.md  — 기술 스택 & 시스템 설계
├── 02_frontend/            — React + React Flow 캔버스 UI
├── 03_backend/             — Fastify API + 코드 생성 엔진
├── 04_db/                  — PostgreSQL 스키마 + Prisma
└── 05_qa_report.md         — 통합 검증 결과

### QA 결과
[qa_report 요약: 통과/실패 항목]

### 다음 단계
1. `_workspace/` 산출물 기반으로 실제 프로젝트 초기화
2. 환경 변수 설정 (`_workspace/03_backend/.env.example` 참고)
3. DB 마이그레이션 실행
```

## 에러 핸들링
- 에이전트 작업 실패 시: 1회 재시도 후 실패 시 해당 에이전트 산출물 없이 진행 (보고서에 명시)
- QA에서 치명적 불일치 발견 시: 해당 에이전트 수정 요청 후 재검증 1회
- 상충 데이터 발생 시: 삭제하지 않고 양쪽 출처를 병기

## 테스트 시나리오

### 정상 흐름
1. "온라인 ERD 서비스 만들어줘" 트리거
2. 기술 스택 선호도 확인 (Node.js + React 기본값 수락)
3. architect → frontend/backend/db 병렬 → qa 순으로 실행
4. `_workspace/05_qa_report.md`에 전체 PASS 확인

### 에러 흐름
1. backend-agent가 frontend와 다른 ERD 타입 사용 시
2. qa-agent가 불일치 감지 → backend-agent에 수정 요청
3. backend-agent 수정 후 qa 재검증 → PASS

### 부분 재실행 시나리오
1. "백엔드 코드 생성 부분만 다시 해줘" 요청
2. Phase 0에서 _workspace/ 확인 → 부분 재실행 모드
3. backend-agent만 재실행 → qa-agent 경계면 1, 3 재검증
