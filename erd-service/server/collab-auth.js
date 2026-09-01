// WS 업그레이드 인증 — 쿠키 JWT(소유자) 또는 ?share=<토큰>(공유 링크)로 접근/역할을 판정.
// REST 공개 읽기와 동일한 access-util.resolveDiagramAccess를 재사용한다.
import { resolveDiagramAccess } from './access-util.js';

export async function resolveConnection(app, req) {
  const diagramId = Number(req.params.id);

  // 쿠키/헤더의 JWT가 있으면 사용자 신원 확보(없어도 됨 — 공유 토큰 경로)
  let user = null;
  try { await req.jwtVerify(); user = req.user; } catch { /* 비로그인 */ }

  const shareToken = typeof req.query?.share === 'string' ? req.query.share : null;

  const access = await resolveDiagramAccess(app, { diagramId, user, shareToken });
  if (!access) return null;

  const actorId = access.userId != null ? `u${access.userId}` : (access.guestId ?? 'g?');
  // 비로그인 참여자의 표시 이름은 클라이언트가 로케일에 맞게 채운다(서버는 로케일을 모름)
  const label = user?.username ?? null;
  return { ...access, actorId, label };
}
