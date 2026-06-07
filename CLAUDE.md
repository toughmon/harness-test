# CLAUDE.md

## 하네스: 온라인 ERD 작성 서비스

**목표:** React + Node.js 기반 ERD 다이어그램 작성 서비스를 에이전트 팀이 협력하여 설계·구현한다.

**트리거:** ERD 서비스 개발, 구축, 구현, 설계, 수정, 보완 등 ERD 서비스 관련 작업 요청 시 `erd-orchestrator` 스킬을 사용하라. 단순 질문(ERD란 무엇인가, 특정 기술 설명 등)은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-06 | 초기 구성 | 전체 | ERD 서비스 하네스 신규 구축 |
| 2026-06-07 | 관계선 연결점 분산 렌더링 | 프론트엔드 | 한 엔티티에 관계가 여러 개일 때 관계선 시작점이 동일해 겹쳐 보이는 문제 개선 — 플로팅 엣지 + 슬롯 분산 방식 도입 (`src/utils/edgeConnection.ts` 신규, `RelationshipEdge.tsx` 수정, `verify_fanout.mjs` e2e 추가) |
| 2026-06-07 | DataModeler Pro 디자인 적용 | 프론트엔드 | 사용자 제공 HTML 시안 기반 전면 재디자인 — M3 다크 팔레트 토큰화(`index.css` @theme), TopNav/좌측 사이드바(`Sidebar.tsx` 신규)/우측 Properties 패널/엔티티 노드/플로팅 줌 툴바 적용. 기존 기능(엔티티·컬럼 CRUD, 관계 연결, 저장/불러오기, 색상) 전부 유지, 시안의 미구현 요소(File/Edit/Export 메뉴, Relations/Layers/History, Description, Cancel/Apply)는 placeholder 또는 제외 (`verify_design.mjs` e2e 추가) |
| 2026-06-07 | 논리명/물리명 동시 표시 + Description | 프론트엔드 | 엔티티·컬럼에 논리명(한글 명칭) 필드, 엔티티에 Description 필드 추가 — 노드/사이드바/Properties 패널에 물리명+논리명 병기, 식별 관계 FK 자동 생성 시 논리명도 자동 조합("사용자 아이디"). optional 필드라 기존 저장 파일과 호환 (`types/erd.ts`, `erdStore.ts`, `EntityNode.tsx`, `EntityEditPanel.tsx`, `Sidebar.tsx` 수정, `verify_logical.mjs` e2e 추가) |
| 2026-06-07 | 유지보수 모드 QA 절차 의무화 | erd-orchestrator 스킬 | 실코드(erd-service/) 단계의 검증 절차 부재 — Phase 0에 유지보수 모드 분기 추가, 빌드+e2e+회귀+시각확인+이력기록 필수 체크리스트 신설 |
| 2026-06-07 | Undo/Redo·PNG 내보내기·자동 정렬·관계 타입 변경 | 프론트엔드 | 편집 기능 4종 추가 — ① 히스토리 스택 기반 Undo/Redo(Ctrl+Z/Y, 연속 입력 800ms 병합, 상한 50), ② html-to-image 기반 PNG 내보내기, ③ dagre 기반 관계 구조 자동 정렬(Undo 가능), ④ 엣지 선택 툴바에서 관계 타입 변경(식별↔비식별 전환 시 FK 자동 추가/제거). `erdStore.ts` 히스토리 재구성, `autoLayout.ts`·`exportImage.ts` 신규, `verify_features.mjs` e2e 14항목 PASS, 회귀(verify_logical) PASS |
| 2026-06-07 | 좌측 사이드바 placeholder 메뉴 제거 | 프론트엔드 | 사용하지 않는 Entities/Relations/Layers/History 4개 비활성 메뉴 제거 — Entity List가 사이드바 상단으로 이동, Help/Docs 푸터는 유지 (`Sidebar.tsx` 수정, NavItem 단순화, `verify_sidebar_cleanup.mjs` e2e 9항목 PASS, 회귀 verify_logical PASS) |
| 2026-06-07 | 상단 GNB placeholder 메뉴·범례 제거 | 프론트엔드 | 사용하지 않는 File/Edit/View/Export 메뉴 4개와 식별/비식별/선택 Barker 범례 제거 — 브랜드·Undo/Redo·Save·불러오기·알림/설정/아바타는 유지 (`Toolbar.tsx` 수정, LegendItem 삭제, `verify_gnb_cleanup.mjs` e2e 14항목 PASS, 회귀 verify_design PASS) |
| 2026-06-07 | 프로덕션 Node 서버 추가 | 서버 | Ubuntu 배포용 단일 Node 프로세스 구성 — Fastify 기반 `server/index.js` 신규(dist 정적 서빙 + SPA fallback, /api/*는 404 JSON으로 제외해 향후 백엔드 라우트 추가 지점 확보), `npm start` 스크립트·fastify/@fastify/static 의존성 추가. 포트는 PORT 환경변수(기본 8080). `verify_server.mjs` e2e 8항목 PASS, 회귀(verify_sidebar_cleanup, 8080 대상) PASS |
| 2026-06-07 | package-lock 동기화 수정 | 의존성 | Ubuntu 서버 `npm ci` 실패(EUSAGE — `@emnapi/core`·`@emnapi/runtime` 락파일 누락) 해결 — Windows에서 생성된 락파일에 wasm32-wasi optional 패키지의 의존성 항목이 빠지는 npm 크로스 플랫폼 버그. 1차 락파일 재생성으로 부족해 2차로 `@emnapi/core`·`@emnapi/runtime@1.10.0`을 devDependencies에 명시 추가해 락파일 항목 강제 생성. 빌드 산출물 해시 동일(회귀 없음), `npm ci --dry-run` PASS |
| 2026-06-07 | 컬럼 드래그 순서 변경 | 프론트엔드 | 엔티티 설정 패널(Properties) 컬럼 목록에 드래그 핸들(drag_indicator) 추가 — HTML5 DnD로 행 위에 드롭하면 기존 `moveColumn` 액션 호출(스토어 변경 없음), 드래그 중 반투명·드롭 대상 하이라이트, Undo 가능. `EntityEditPanel.tsx` 수정, `verify_column_drag.mjs` e2e 5항목 PASS, 회귀(verify_features·verify_logical) PASS |
| 2026-06-07 | 비식별 관계도 FK 생성 (식별자 미포함) | 프론트엔드 | 표준 ERD 의미론 정정 — 모든 관계 타입에서 FK 자동 생성하되 플래그 차등: 식별=PK 포함+NN, 비식별=PK 미포함+NN, 선택=PK 미포함+NULL 허용. 타입 변경 시 FK 제거/재생성 대신 플래그만 전환(컬럼명 수정 보존, FK 없는 기존 데이터는 생성), 관계 삭제 시 모든 타입에서 자동 FK 제거. `erdStore.ts`(fkFlagsFor 신설, buildFKColumns 파라미터화)·`RelTypeModal.tsx`(설명 문구) 수정, verify_features 기대값 갱신 14항목 PASS·verify_fk_cleanup 13항목으로 확장 PASS, 회귀(verify_logical·verify_backend) PASS. ※ verify_fanout도 barker처럼 개편 이전 버튼 텍스트를 쓰는 구버전임을 확인(BASE_URL 지원만 추가) |
| 2026-06-07 | 엔티티/관계 삭제 시 잔존 FK 정리 | 프론트엔드 | 상위 엔티티 삭제 후 하위 엔티티에 자동 생성 FK 컬럼이 남는 버그 수정 — `deleteEntity`가 삭제 대상을 참조(refEntityId)하는 FK 컬럼을 함께 제거, 같은 규칙으로 `deleteRelationship`도 식별 관계 삭제 시 FK 제거(타입 변경 식별→비식별과 동일 동작). 둘 다 Undo로 복원 가능 (`erdStore.ts` 수정, `verify_fk_cleanup.mjs` e2e 11항목 PASS, 회귀 verify_features·verify_backend PASS) |
| 2026-06-07 | 네이티브 다이얼로그 → 커스텀 모달 교체 | 프론트엔드 | window.confirm/prompt/alert 전부를 디자인 시스템 모달로 교체 — `dialogStore.ts`(Promise 기반 alert/confirm/prompt)·`DialogModal.tsx`(danger 변형, Enter/Esc, 빈 입력 방지) 신규. 다이어그램 저장 이름 입력·이름 변경·삭제 확인·전환/로그아웃 시 미저장 경고·불러오기/PNG/저장 실패 알림에 적용, 확인창 없던 엔티티 삭제에도 확인 모달 추가. `verify_backend.mjs` 24항목으로 확장 PASS, 회귀(verify_features 14항목) PASS. ※ verify_barker는 디자인 개편 이전 버튼 텍스트를 쓰는 구버전이라 개편 시점부터 동작 불가(이번 변경과 무관) |
| 2026-06-07 | 로그인 + 다이어그램 DB 저장 백엔드 | 백엔드+프론트엔드 | 아이디/비밀번호 가입·로그인(JWT httpOnly 쿠키, scrypt 해싱)과 사용자별 다이어그램 DB 저장(PostgreSQL JSONB, DATABASE_URL 미설정 시 pg-mem 폴백) 추가 — `server/db.js`·`auth-routes.js`·`diagram-routes.js` 신규, `src/api/client.ts`·`authStore.ts`·`diagramStore.ts`(dirty 추적)·`AuthModal.tsx`·`utils/erdData.ts` 신규, Toolbar(DB 저장 버튼·아바타 로그인/로그아웃)·Sidebar(내 다이어그램 목록: 전환/이름변경/삭제)·vite proxy 수정. 비로그인 사용·PNG 내보내기·JSON 파일 Save/불러오기는 기존 그대로 유지. `verify_backend.mjs` e2e 19항목 PASS, 회귀(verify_server·verify_gnb_cleanup·verify_features 14항목) PASS |
