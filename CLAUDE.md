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
| 2026-06-07 | package-lock 동기화 수정 | 의존성 | Ubuntu 서버 `npm ci` 실패(EUSAGE — `@emnapi/core`·`@emnapi/runtime` 락파일 누락) 해결 — Windows에서 생성된 락파일에 `@napi-rs/wasm-runtime`의 peer 의존성 항목이 빠진 npm 버그. 락파일 삭제 후 재생성으로 해당 패키지 제거·`@emnapi/wasi-threads` 추가. 빌드 산출물 해시 동일(회귀 없음), `npm ci --dry-run` PASS |
