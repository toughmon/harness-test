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
