import { useCallback } from 'react';
import { useLocaleStore, type Locale } from './locale';
import { ko, type MessageKey } from './ko';
import { en } from './en';

export { useLocaleStore, type Locale } from './locale';
export type { MessageKey } from './ko';

export type TParams = Record<string, string | number>;
export type TFunc = (key: MessageKey, params?: TParams) => string;

const DICTS: Record<Locale, Record<MessageKey, string>> = { ko, en };

// {name} 형태의 자리표시자만 치환한다. 복수형 규칙은 두지 않는다
// (해당 문구는 영어에서도 수량 무관 표현으로 작성).
export function translate(locale: Locale, key: MessageKey, params?: TParams): string {
  let s: string = DICTS[locale][key] ?? ko[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

// 컴포넌트용 — 로케일이 바뀌면 리렌더된다. JSX 안에서는 반드시 이쪽을 쓸 것.
export function useT(): TFunc {
  const locale = useLocaleStore(s => s.locale);
  return useCallback((key: MessageKey, params?: TParams) => translate(locale, key, params), [locale]);
}

// React 밖(스토어·유틸)에서 호출 시점의 로케일로 번역할 때 사용.
// 구독하지 않으므로 렌더 경로에서는 쓰지 말 것 — 로케일 변경 시 갱신되지 않는다.
export function getT(): TFunc {
  const locale = useLocaleStore.getState().locale;
  return (key: MessageKey, params?: TParams) => translate(locale, key, params);
}
