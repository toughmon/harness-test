import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { ApiError } from '../../api/client';

// 로그인/가입 모달 — RelTypeModal과 동일한 오버레이 패턴

type Mode = 'login' | 'register';

const ERROR_MESSAGES: Record<string, string> = {
  username_taken: '이미 사용 중인 아이디입니다.',
  invalid_credentials: '아이디 또는 비밀번호가 올바르지 않습니다.',
};

export default function AuthModal() {
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
      setError('아이디는 3자 이상이어야 합니다 (영문/숫자/._-).');
      return;
    }
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(ERROR_MESSAGES[err.code] ?? (err.status === 400 ? '입력 형식이 올바르지 않습니다.' : `오류가 발생했습니다 (${err.code})`));
      } else {
        setError('서버에 연결할 수 없습니다.');
      }
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
            {mode === 'login' ? '로그인' : '회원가입'}
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
              {m === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>

        <form className="p-5 flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">아이디</span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="영문/숫자 3자 이상"
              autoFocus
              className="bg-surface border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:border-primary outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="8자 이상"
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
            {busy ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
          <button
            type="button"
            className="w-full text-xs text-on-surface-variant hover:text-on-surface py-1 cursor-pointer transition-colors"
            onClick={closeModal}
          >
            취소
          </button>
        </form>
      </div>
    </div>
  );
}
