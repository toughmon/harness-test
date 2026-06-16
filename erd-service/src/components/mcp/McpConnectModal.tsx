import { useEffect, useState } from 'react';
import { useMcpStore } from '../../store/mcpStore';
import { useAuthStore } from '../../store/authStore';
import { api, McpToken, McpTokenIssued } from '../../api/client';

// MCP 원클릭 연결 모달 — 로그인 사용자가 개인 토큰(PAT)을 발급하고, 토큰이 박힌
// `claude mcp add` 한 줄을 복사해 Claude Code에 붙여넣으면 끝. (서비스계정·레포·재시작 불필요)
// 토큰 원문은 발급 응답 1회만 노출되므로, 그 시점의 명령을 복사하도록 안내한다.

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const MCP_URL = `${ORIGIN}/mcp`;
const TOKEN_PLACEHOLDER = '<발급한_토큰>';

function buildCommand(token: string) {
  return `claude mcp add --transport http --header "Authorization: Bearer ${token}" erd ${MCP_URL}`;
}
function buildJson(token: string) {
  return JSON.stringify(
    { mcpServers: { erd: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } },
    null, 2
  );
}

export default function McpConnectModal() {
  const { closeModal } = useMcpStore();
  const { status, openModal: openAuth } = useAuthStore();

  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [issued, setIssued] = useState<McpTokenIssued | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const authed = status === 'authed';

  useEffect(() => {
    if (!authed) return;
    api.listMcpTokens().then(setTokens).catch(() => setError('토큰 목록을 불러오지 못했습니다.'));
  }, [authed]);

  const issue = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const t = await api.createMcpToken(label.trim() || undefined);
      setIssued(t);
      setLabel('');
      setTokens(await api.listMcpTokens());
    } catch {
      setError('토큰 발급에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    try {
      await api.deleteMcpToken(id);
      setTokens(await api.listMcpTokens());
      if (issued?.id === id) setIssued(null);
    } catch {
      setError('토큰 취소에 실패했습니다.');
    }
  };

  const copy = (text: string, which: string) => {
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(which); setTimeout(() => setCopied(''), 1500); },
      () => { /* 클립보드 불가 시 무시 — 사용자가 수동 선택 */ }
    );
  };

  const shownToken = issued?.token ?? TOKEN_PLACEHOLDER;
  const command = buildCommand(shownToken);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
      <div
        data-testid="mcp-connect-modal"
        className="rounded-xl shadow-2xl overflow-hidden w-[560px] max-w-[92vw] max-h-[88vh] flex flex-col bg-surface-container border border-outline-variant"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-outline-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">cable</span>
          <h3 className="text-sm font-semibold text-on-surface m-0 flex-1">Claude Code MCP 연결</h3>
          <button
            className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-on-surface cursor-pointer"
            onClick={closeModal}
            aria-label="닫기"
          >
            close
          </button>
        </div>

        {!authed ? (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">lock</span>
            <p className="text-sm text-on-surface-variant m-0">
              MCP 토큰을 발급하려면 먼저 로그인해야 합니다.
            </p>
            <button
              className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-inverse-primary hover:text-white transition-colors cursor-pointer"
              onClick={() => { closeModal(); openAuth(); }}
            >
              로그인 / 회원가입
            </button>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            <p className="text-xs text-on-surface-variant m-0 leading-relaxed">
              아래 한 줄을 복사해 터미널에 붙여넣으면 Claude Code가 이 ERD 서비스에 바로 연결됩니다.
              레포 복제·Node 설치·파일 편집·재시작이 필요 없습니다.
            </p>

            {/* 토큰 발급 */}
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">토큰 이름 (선택)</span>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="예: 내 노트북 Claude Code"
                  maxLength={100}
                  className="bg-surface border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:border-primary outline-none"
                />
              </label>
              <button
                data-testid="mcp-issue-token"
                disabled={busy}
                onClick={issue}
                className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-inverse-primary hover:text-white transition-colors cursor-pointer active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
              >
                {busy ? '발급 중...' : '토큰 발급'}
              </button>
            </div>

            {issued && (
              <div data-testid="mcp-issued-token" className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  토큰은 지금만 표시됩니다 — 아래 명령을 바로 복사하세요
                </span>
              </div>
            )}

            {/* 복사용 명령 */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">연결 명령</span>
              <div className="relative">
                <pre
                  data-testid="mcp-command"
                  className="bg-surface border border-outline-variant rounded-lg p-3 pr-10 text-[11px] leading-relaxed text-on-surface font-mono whitespace-pre-wrap break-all m-0"
                >{command}</pre>
                <button
                  data-testid="mcp-copy"
                  onClick={() => copy(command, 'cmd')}
                  disabled={!issued}
                  title={issued ? '복사' : '먼저 토큰을 발급하세요'}
                  className="absolute top-2 right-2 material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary cursor-pointer disabled:opacity-40"
                >
                  {copied === 'cmd' ? 'check' : 'content_copy'}
                </button>
              </div>
              {!issued && (
                <span className="text-[11px] text-outline italic">
                  토큰을 발급하면 명령에 실제 토큰이 채워집니다.
                </span>
              )}
            </div>

            {/* .mcp.json 대안 */}
            {issued && (
              <details className="text-xs text-on-surface-variant">
                <summary className="cursor-pointer hover:text-on-surface">또는 .mcp.json에 직접 추가</summary>
                <div className="relative mt-2">
                  <pre className="bg-surface border border-outline-variant rounded-lg p-3 pr-10 text-[11px] leading-relaxed text-on-surface font-mono whitespace-pre-wrap break-all m-0">{buildJson(issued.token)}</pre>
                  <button
                    onClick={() => copy(buildJson(issued.token), 'json')}
                    className="absolute top-2 right-2 material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary cursor-pointer"
                    title="복사"
                  >
                    {copied === 'json' ? 'check' : 'content_copy'}
                  </button>
                </div>
              </details>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2" data-testid="mcp-error">{error}</div>
            )}

            {/* 발급된 토큰 목록 */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">발급된 토큰</span>
              <div data-testid="mcp-token-list" className="flex flex-col gap-1">
                {tokens.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded border border-outline-variant text-xs text-on-surface">
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">key</span>
                    <span className="flex-1 truncate">{t.label || '(이름 없음)'}</span>
                    <span className="text-[10px] text-outline shrink-0">
                      {t.last_used_at ? '사용됨' : '미사용'}
                    </span>
                    <button
                      onClick={() => revoke(t.id)}
                      title="취소"
                      aria-label={`Revoke token ${t.id}`}
                      className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-red-400 cursor-pointer shrink-0"
                    >
                      delete
                    </button>
                  </div>
                ))}
                {tokens.length === 0 && (
                  <div className="px-3 py-1 text-xs text-outline italic">아직 발급한 토큰이 없습니다.</div>
                )}
              </div>
            </div>

            <a
              href="/mcp-guide.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-primary hover:underline self-start no-underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[13px]">help</span>
              자세한 연결 가이드 보기
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
