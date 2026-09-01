import { useEffect, useState } from 'react';
import { useMcpStore } from '../../store/mcpStore';
import { useAuthStore } from '../../store/authStore';
import { api, McpToken, McpTokenIssued } from '../../api/client';
import { useT, getT, useLocaleStore } from '../../i18n';

// MCP 원클릭 연결 모달 — 로그인 사용자가 개인 토큰(PAT)을 발급하고, 토큰이 박힌
// `claude mcp add` 한 줄을 복사해 Claude Code에 붙여넣으면 끝. (서비스계정·레포·재시작 불필요)
// 토큰 원문은 발급 응답 1회만 노출되므로, 그 시점의 명령을 복사하도록 안내한다.

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const MCP_URL = `${ORIGIN}/mcp`;

function buildCommand(token: string) {
  // `--header`는 가변인자(<header...>)라 name/url 뒤(맨 끝)에 와야 한다.
  // 앞에 두면 뒤의 erd·URL까지 헤더 값으로 삼켜 "missing required argument 'name'" 에러가 난다.
  return `claude mcp add --scope user --transport http erd ${MCP_URL} --header "Authorization: Bearer ${token}"`;
}
function buildJson(token: string) {
  return JSON.stringify(
    { mcpServers: { erd: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${token}` } } } },
    null, 2
  );
}

// http(비보안 컨텍스트)에선 navigator.clipboard가 없으므로 execCommand로 폴백 복사.
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function McpConnectModal() {
  const tr = useT();
  const guideBase = useLocaleStore(s => s.locale) === 'en' ? '/en' : '';
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
    api.listMcpTokens().then(setTokens).catch(() => setError(getT()('mcp.listFailed')));
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
      setError(tr('mcp.issueFailed'));
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
      setError(tr('mcp.revokeFailed'));
    }
  };

  const copy = (text: string, which: string) => {
    const done = () => { setCopied(which); setTimeout(() => setCopied(''), 1500); };
    // navigator.clipboard는 HTTPS·localhost 등 보안 컨텍스트에서만 존재 → http 배포에선 execCommand 폴백
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => { if (legacyCopy(text)) done(); });
    } else if (legacyCopy(text)) {
      done();
    }
  };

  const shownToken = issued?.token ?? tr('mcp.tokenPlaceholderText');
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
          <h3 className="text-sm font-semibold text-on-surface m-0 flex-1">{tr('mcp.title')}</h3>
          <button
            className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-on-surface cursor-pointer"
            onClick={closeModal}
            aria-label={tr('common.close')}
          >
            close
          </button>
        </div>

        {!authed ? (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">lock</span>
            <p className="text-sm text-on-surface-variant m-0">
              {tr('mcp.loginRequired')}
            </p>
            <button
              className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-inverse-primary hover:text-white transition-colors cursor-pointer"
              onClick={() => { closeModal(); openAuth(); }}
            >
              {tr('mcp.loginOrRegister')}
            </button>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            <p className="text-xs text-on-surface-variant m-0 leading-relaxed">
              {tr('mcp.intro')}
            </p>

            {/* 토큰 발급 */}
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">{tr('mcp.tokenLabel')}</span>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder={tr('mcp.tokenPlaceholder')}
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
                {tr(busy ? 'mcp.issuing' : 'mcp.issue')}
              </button>
            </div>

            {issued && (
              <div data-testid="mcp-issued-token" className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  {tr('mcp.tokenOnce')}
                </span>
              </div>
            )}

            {/* 복사용 명령 */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">{tr('mcp.command')}</span>
              <div className="relative">
                <pre
                  data-testid="mcp-command"
                  className="bg-surface border border-outline-variant rounded-lg p-3 pr-10 text-[11px] leading-relaxed text-on-surface font-mono whitespace-pre-wrap break-all m-0"
                >{command}</pre>
                <button
                  data-testid="mcp-copy"
                  onClick={() => copy(command, 'cmd')}
                  disabled={!issued}
                  title={tr(issued ? 'common.copy' : 'mcp.issueFirst')}
                  className="absolute top-2 right-2 material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary cursor-pointer disabled:opacity-40"
                >
                  {copied === 'cmd' ? 'check' : 'content_copy'}
                </button>
              </div>
              {!issued && (
                <span className="text-[11px] text-outline italic">
                  {tr('mcp.tokenFillHint')}
                </span>
              )}
            </div>

            {/* .mcp.json 대안 */}
            {issued && (
              <details className="text-xs text-on-surface-variant">
                <summary className="cursor-pointer hover:text-on-surface">{tr('mcp.orMcpJson')}</summary>
                <div className="relative mt-2">
                  <pre className="bg-surface border border-outline-variant rounded-lg p-3 pr-10 text-[11px] leading-relaxed text-on-surface font-mono whitespace-pre-wrap break-all m-0">{buildJson(issued.token)}</pre>
                  <button
                    onClick={() => copy(buildJson(issued.token), 'json')}
                    className="absolute top-2 right-2 material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary cursor-pointer"
                    title={tr('common.copy')}
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
              <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">{tr('mcp.issuedTokens')}</span>
              <div data-testid="mcp-token-list" className="flex flex-col gap-1">
                {tokens.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded border border-outline-variant text-xs text-on-surface">
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">key</span>
                    <span className="flex-1 truncate">{t.label || tr('share.unnamed')}</span>
                    <span className="text-[10px] text-outline shrink-0">
                      {tr(t.last_used_at ? 'share.used' : 'share.unused')}
                    </span>
                    <button
                      onClick={() => revoke(t.id)}
                      title={tr('mcp.revokeToken')}
                      aria-label={`Revoke token ${t.id}`}
                      className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-red-400 cursor-pointer shrink-0"
                    >
                      delete
                    </button>
                  </div>
                ))}
                {tokens.length === 0 && (
                  <div className="px-3 py-1 text-xs text-outline italic">{tr('mcp.empty')}</div>
                )}
              </div>
            </div>

            <a
              href={`${guideBase}/mcp-guide.html`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-primary hover:underline self-start no-underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[13px]">help</span>
              {tr('mcp.seeGuide')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
