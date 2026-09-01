import { getT } from './index';
import type { MessageKey } from './ko';
import { ApiError } from '../api/client';

// 서버는 사람이 읽는 문장이 아니라 기계 판독용 코드({error:'not_found'})만 반환한다.
// 사용자에게 보일 문구는 여기서 한 번에 결정한다 — 예전에는 AuthModal에만 매핑이 있어
// 나머지 코드는 "오류가 발생했습니다 (not_found)"처럼 코드가 그대로 새어나갔다.
const CODE_KEYS: Record<string, MessageKey> = {
  username_taken: 'error.usernameTaken',
  invalid_credentials: 'error.invalidCredentials',
  not_found: 'error.notFound',
  name_required: 'error.nameRequired',
  login_required: 'error.loginRequired',
  invalid_or_revoked_share: 'error.invalidShare',
  invalid_token: 'error.invalidToken',
  Unauthorized: 'error.unauthorized',
};

// 알 수 없는 코드는 마지막 수단으로 코드를 노출한다(디버깅 단서는 남기되 문장은 번역된 것).
export function errorMessage(err: unknown): string {
  const t = getT();
  if (err instanceof ApiError) {
    const key = CODE_KEYS[err.code];
    if (key) return t(key);
    if (err.status === 400) return t('error.badRequest');
    return t('error.generic', { code: err.code });
  }
  if (err instanceof Error && err.message) return err.message;
  return t('error.network');
}
