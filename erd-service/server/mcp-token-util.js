// MCP 개인 액세스 토큰(PAT) 생성·해시.
// 토큰 원문은 발급 시 1회만 노출하고 DB에는 sha256 해시만 저장한다.
// (토큰은 고엔트로피 난수라 password처럼 느린 KDF가 필요 없음 — 단방향 sha256로 충분)
import { randomBytes, createHash } from 'node:crypto';

export const TOKEN_PREFIX = 'erdmcp_';

export function generateToken() {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
