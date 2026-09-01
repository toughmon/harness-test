import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';
import { errorMessage } from '../../i18n/errors';

// 로그인/가입 모달 — RelTypeModal과 동일한 오버레이 패턴

type Mode = 'login' | 'register';

export default function AuthModal() {
  const t = useT();
  const { login, register, closeModal } = useAuthStore();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (username.trim().length < 3) {
      setError(t('auth.usernameTooShort'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={closeModal}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden w-80 bg-surface-container border border-outline-variant"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-outline-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">person</span>
          <h3 className="text-sm font-semibold text-on-surface m-0">
            {t(mode === 'login' ? 'auth.login' : 'auth.register')}
          </h3>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-outline-variant">
          {(['login', 'register'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              className={`flex-1 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                mode === m
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={() => switchMode(m)}
            >
              {t(m === 'login' ? 'auth.login' : 'auth.register')}
            </button>
          ))}
        </div>

        <form className="p-5 flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">{t('auth.username')}</span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('auth.usernamePlaceholder')}
              autoFocus
              className="bg-surface border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:border-primary outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">{t('auth.password')}</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              className="bg-surface border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:border-primary outline-none"
            />
          </label>

          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2" data-testid="auth-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-primary text-on-primary py-2 rounded-lg text-sm font-semibold hover:bg-inverse-primary hover:text-white transition-colors cursor-pointer active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? t('auth.busy') : t(mode === 'login' ? 'auth.login' : 'auth.signUp')}
          </button>
          <button
            type="button"
            className="w-full text-xs text-on-surface-variant hover:text-on-surface py-1 cursor-pointer transition-colors"
            onClick={closeModal}
          >
            {t('common.cancel')}
          </button>
        </form>
      </div>
    </div>
  );
}
