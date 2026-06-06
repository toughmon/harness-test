---
name: erd-qa
description: "ERD 서비스의 프론트엔드-백엔드-DB 경계면 통합 정합성 검증, API 응답 shape과 React 훅 타입 교차 비교, DB 스키마와 Prisma 모델 일치 확인, 코드 생성 정확성 검증. ERD 서비스 통합 테스트, QA 검증, 경계면 버그 발견 요청 시 반드시 이 스킬을 사용할 것."
---

# ERD 서비스 QA 검증 스킬

## 목표
각 에이전트의 산출물이 실제로 맞물리는지 경계면에서 교차 검증하여 통합 버그를 조기에 발견한다.

## 검증 원칙
"파일이 존재하는가"가 아니라 "이 파일의 타입이 저 파일의 타입과 일치하는가"를 확인한다.

## 검증 체크리스트

### 경계면 1: 프론트엔드 ↔ 백엔드 API

```
□ API 엔드포인트 URL 일치
  - backend routes.md의 엔드포인트
  - frontend useERD.ts의 fetch URL
  → 목록 비교하여 불일치 찾기

□ ERDSchema 타입 일치
  - frontend types/erd.ts: ERDSchema 인터페이스
  - backend schema-format.md: JSON 스펙
  → 필드명, 타입, 필수여부 비교

□ API 응답 shape 일치
  - backend 라우터의 응답 객체
  - frontend 훅의 응답 파싱 코드
  → shape mismatch 발견

□ WebSocket 이벤트 이름/페이로드 일치
  - backend ws-protocol.md
  - frontend useCollaboration.ts
  → 이벤트명 오타, 페이로드 구조 차이 확인

□ 에러 응답 코드 처리
  - backend APIError.code 목록
  - frontend 에러 핸들러의 분기 조건
  → 누락된 에러 코드 처리 확인
```

### 경계면 2: 백엔드 ↔ DB

```
□ Prisma 모델 필드 ↔ DB 테이블 컬럼
  - schema.prisma 모델 정의
  - schema.sql 테이블 정의
  → 필드명/타입/NULL 제약 일치 확인

□ FK 관계 방향 일치
  - schema.prisma @relation 정의
  - schema.sql REFERENCES 방향
  → 역방향 관계 오류 확인

□ ERD JSON 저장/파싱 일치
  - db의 erd-json-spec.md 포맷
  - backend 코드 생성 엔진의 파싱 코드
  → 필드 경로, 타입 캐스팅 확인
```

### 경계면 3: 코드 생성 정확성

```
□ ERD 타입 → SQL 타입 매핑
  - backend의 타입 매핑 테이블
  - 실제 코드 생성기 구현
  → 매핑 누락/오류 확인

□ FK 관계 → SQL REFERENCES 생성
  - ONE_TO_MANY → 외래키 방향 확인
  - MANY_TO_MANY → junction table 생성 여부

□ Prisma 생성 결과 문법 검증
  - 생성된 Prisma Schema가 파서에서 유효한지
  - @relation의 fields/references 쌍 완전성
```

## 검증 실행 방법

```bash
# 경계면 1 검증 스크립트
# _workspace/02_frontend/types/erd.ts와
# _workspace/03_backend/schema-format.md를 동시에 읽어 비교

# 경계면 2 검증
# _workspace/04_db/schema.prisma와
# _workspace/04_db/schema.sql을 비교

# 코드 생성 검증
# 샘플 ERD JSON을 코드 생성 엔진에 통과시켜 출력 확인
```

## 보고서 형식

`_workspace/05_qa_report.md`에 다음 형식으로 작성:

```markdown
## QA 검증 보고서

### 경계면 1: 프론트 ↔ 백엔드
| 항목 | 상태 | 세부 내용 |
|------|------|---------|
| API URL 일치 | ✅ PASS | - |
| ERDSchema 타입 | ❌ FAIL | frontend Column.type: string, backend spec: ColumnType enum |

### 발견된 불일치 (심각도별)
#### 높음
- [파일A:라인N] ↔ [파일B:라인M]: 설명

### 수정 권고
- frontend-agent: ...
- backend-agent: ...
```

## 점진적 검증 타이밍
- architect 완료 → 없음 (설계 단계)
- frontend 완료 → 경계면 1의 타입 정의 비교
- backend 완료 → 경계면 1 전체 + 코드 생성 기초 검증
- db 완료 → 경계면 2 전체
- 전체 완료 → 최종 통합 보고서
