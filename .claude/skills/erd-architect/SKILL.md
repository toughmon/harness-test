---
name: erd-architect
description: "온라인 ERD 서비스의 기술 스택 설계, 시스템 아키텍처 정의, 컴포넌트 분리 전략 수립. ERD 서비스 아키텍처 설계, 기술 스택 선택, 캔버스 라이브러리 선택, 실시간 협업 전략, 코드 생성 엔진 설계 요청 시 반드시 이 스킬을 사용할 것."
---

# ERD 서비스 아키텍처 설계 스킬

## 목표
ERD 서비스의 전체 기술 스택과 시스템 구조를 결정하여 다른 에이전트가 명확한 기반 위에서 구현을 시작할 수 있게 한다.

## 설계 결정 프레임워크

### 1. ERD 서비스 특성 파악
ERD 서비스의 핵심 요구사항을 먼저 확인한다:
- 동시 편집 사용자 수 (개인용 vs 팀 협업)
- 지원할 ERD 규모 (엔티티 수 상한)
- 코드 생성 대상 (SQL/ORM/양쪽)
- 배포 환경 (SaaS/자체 호스팅)

### 2. 캔버스 라이브러리 선택 기준

| 라이브러리 | 강점 | 약점 | 권장 상황 |
|-----------|------|------|---------|
| **React Flow** | React 통합, 커스터마이징 쉬움, 활성 커뮤니티 | 번들 크기 큼 | 팀 협업, 커스텀 노드 필요 |
| **Mermaid** | 텍스트 기반, 가볍고 빠름 | 인터랙션 제한 | 읽기 중심, 간단한 뷰어 |
| **D3.js** | 완전한 자유도 | 구현 복잡도 매우 높음 | 고급 시각화 필요 시 |
| **Excalidraw** | 손그림 느낌, 협업 내장 | ERD 전용 기능 없음 | 자유형 다이어그램 |

→ **기본 권장: React Flow** (ERD 특화 노드 커스터마이징 + React 생태계 활용)

### 3. 실시간 협업 전략

```
단순 동시편집 (락 기반)    → 간단하지만 충돌 시 UX 나쁨
CRDT (Yjs + y-websocket)  → 충돌 없는 병합, 구현 복잡도 중간
OT (Operational Transform) → 충돌 해결 강력, 서버 부담 큼
```

→ **기본 권장: Yjs + y-websocket** (CRDT, ERD 노드 이동/편집 충돌 해결 최적)

### 4. 백엔드 프레임워크 선택

| 언어/프레임워크 | 실시간 협업 | TypeScript | 권장 |
|--------------|-----------|-----------|------|
| Node.js + Express/Fastify | 우수 (WebSocket 네이티브) | 완벽 | ✅ |
| Python + FastAPI | 좋음 (asyncio) | - | 팀이 Python 선호 시 |
| Go + Fiber | 최고 성능 | - | 고성능 요구 시 |

→ **기본 권장: Node.js + Fastify** (프론트와 타입 공유, WebSocket 성능)

### 5. ERD 스키마 저장 포맷

```json
{
  "version": "1.0",
  "entities": [
    {
      "id": "uuid",
      "name": "User",
      "position": { "x": 100, "y": 200 },
      "columns": [
        { "id": "uuid", "name": "id", "type": "UUID", "constraints": ["PK"] },
        { "id": "uuid", "name": "email", "type": "VARCHAR(255)", "constraints": ["UNIQUE", "NOT NULL"] }
      ]
    }
  ],
  "relationships": [
    {
      "id": "uuid",
      "from": { "entityId": "uuid", "columnId": "uuid" },
      "to": { "entityId": "uuid", "columnId": "uuid" },
      "type": "ONE_TO_MANY"
    }
  ]
}
```

## 산출물 구조

`_workspace/01_architect_design.md`에 다음을 포함한다:

```markdown
## 기술 스택 결정
| 영역 | 선택 | 이유 | 대안 |
|------|------|------|------|

## 시스템 컴포넌트
[텍스트 형식 다이어그램]

## 프로젝트 디렉토리 구조
[모노레포 또는 멀티레포 뼈대]

## 에이전트별 구현 범위
- frontend-agent: ...
- backend-agent: ...
- db-agent: ...

## 핵심 API 엔드포인트
[엔드포인트 목록]

## ERD JSON 스펙
[위 포맷 기반으로 확정]
```

## 주의사항
- MVP 범위를 명확히 정의하고, v2 기능은 별도 섹션에 기재한다
- 기술 선택은 팀 기술 스택 선호도를 고려한다 (요청자에게 확인)
- 실시간 협업은 복잡도가 높으므로 MVP에서 선택 사항으로 분리할 수 있다
