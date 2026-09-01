import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 지원 로케일 — 한국어가 기본이며, 브라우저 언어 자동 감지는 하지 않는다(수동 토글만).
export type Locale = 'ko' | 'en';

interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
}

// themeStore와 동일한 패턴 — zustand persist(localStorage). 키만 다르다.
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'ko',
      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set((s) => ({ locale: s.locale === 'ko' ? 'en' : 'ko' })),
    }),
    { name: 'erd-locale' }
  )
);
