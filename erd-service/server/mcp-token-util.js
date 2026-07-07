// MCP 개인 액세스 토큰(PAT) 생성·해시.
// 토큰 원문은 발급 시 1회만 노출하고 DB에는 sha256 해시만 저장한다.
// (토큰은 고엔트로피 난수라 password처럼 느린 KDF가 필요 없음 — 단방향 sha256로 충분)
import { randomBytes, createHash } from 'node:crypto';

export const TOKEN_PREFIX = 'erdmcp_';
export const SHARE_TOKEN_PREFIX = 'erdshare_';

export function generateToken() {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

// 다이어그램 공유 링크 토큰 — MCP 토큰과 동일한 고엔트로피 난수, 접두사만 다름.
// hashToken은 접두사 무관하게 전체 문자열을 해시하므로 그대로 재사용.
export function generateShareToken() {
  return SHARE_TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
