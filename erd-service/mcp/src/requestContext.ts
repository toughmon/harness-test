// 요청 단위 컨텍스트 — 원격(co-host) HTTP 모드에서 "현재 요청의 사용자"를 도구 코드까지
// 전달하기 위한 AsyncLocalStorage. stdio 모드에서는 store가 비어 있어(undefined)
// 기존 서비스계정/모듈전역 동작으로 폴백한다.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ReqCtx {
  // 백엔드(/api/*) 자기호출에 첨부할 단기 JWT (인증된 사용자로 동작)
  jwt?: string;
  // 자기호출 대상 베이스 URL (co-host 시 자기 자신)
  baseUrl?: string;
  // MCP 세션 id — 세션별 "현재 다이어그램" 컨텍스트 키
  sessionId?: string;
}

export const reqCtx = new AsyncLocalStorage<ReqCtx>();
