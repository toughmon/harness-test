// 현재 선택된 다이어그램 컨텍스트 — 변형 도구는 명시 diagram_id가 없으면 이 값을 사용.
//
// 원격(co-host) HTTP 모드에서는 여러 사용자가 동시에 붙으므로 모듈 전역을 쓰면 안 된다.
// reqCtx.sessionId가 있으면 세션별 맵에, 없으면(stdio 단일 프로세스) 모듈 전역에 저장한다.
import { reqCtx } from './requestContext';

const bySession = new Map<string, number | null>();
let globalCurrent: number | null = null; // stdio 폴백

export function getCurrentId(): number | null {
  const sid = reqCtx.getStore()?.sessionId;
  return sid != null ? (bySession.get(sid) ?? null) : globalCurrent;
}

export function setCurrentId(id: number | null): void {
  const sid = reqCtx.getStore()?.sessionId;
  if (sid != null) {
    if (id == null) bySession.delete(sid);
    else bySession.set(sid, id);
  } else {
    globalCurrent = id;
  }
}

export function requireCurrentId(): number {
  const id = getCurrentId();
  if (id == null) {
    throw new Error('선택된 다이어그램이 없습니다. 먼저 create_diagram 또는 select_diagram을 호출하세요.');
  }
  return id;
}

// 세션 종료 시 컨텍스트 정리 (메모리 누수 방지)
export function clearSession(sid: string): void {
  bySession.delete(sid);
}
