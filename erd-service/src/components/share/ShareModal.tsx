import { useEffect, useState } from 'react';
import { useShareStore } from '../../store/shareStore';
import { useAuthStore } from '../../store/authStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useCollabStore } from '../../store/collabStore';
import { api, Share, ShareIssued } from '../../api/client';
import { useT, getT } from '../../i18n';

// 다이어그램 공유 모달 — 소유자가 링크를 발급/조회/폐기하고 한 줄 링크를 복사해 공유.
// 대상은 현재 열린 다이어그램(currentId). 링크를 열면 여러 명이 실시간으로 "함께 보기"(읽기 전용).
// 실시간 동시 편집(편집자 링크)은 2단계에서 제공 예정.
// 토큰 원문은 발급 응답 1회만 노출되므로 그 시점의 링크를 복사하도록 안내한다.

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

function shareUrl(token: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/d/${token}`;
}

export default function ShareModal() {
  const t = useT();
  const { closeModal } = useShareStore();
  const { status } = useAuthStore();
  const currentId = useDiagramStore(s => s.currentId);
  const list = useDiagramStore(s => s.list);
  const connect = useCollabStore(s => s.connect);
  const currentName = currentId !== null ? list.find(d => d.id === currentId)?.name : null;

  const [shares, setShares] = useState<Share[]>([]);
  const [issued, setIssued] = useState<ShareIssued | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const authed = status === 'authed';
  const canShare = authed && currentId !== null;

  // 공유 대상 다이어그램이 정해지면 링크 목록을 불러오고, 소유자를 협업 룸에 연결(편집이 뷰어에게 실시간 반영).
  useEffect(() => {
    if (!canShare || currentId === null) return;
    api.listShares(currentId).then(setShares).catch(() => setError(getT()('share.listFailed')));
    connect(currentId);
  }, [canShare, currentId, connect]);

  const issue = async () => {
    if (busy || currentId === null) return;
    setBusy(true); setError('');
    try {
      const s = await api.createShare(currentId, 'viewer', label.trim() || undefined);
      setIssued(s);
      setLabel('');
      setShares(await api.listShares(currentId));
      connect(currentId);   // 링크 발급 즉시 브로드캐스트 시작
    } catch {
      setError(t('share.issueFailed'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    if (currentId === null) return;
    try {
      await api.revokeShare(currentId, id);
      setShares(await api.listShares(currentId));
      if (issued?.id === id) setIssued(null);
    } catch {
      setError(t('share.revokeFailed'));
    }
  };

  const copy = (text: string) => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => { if (legacyCopy(text)) done(); });
    } else if (legacyCopy(text)) {
      done();
    }
  };

  const activeShares = shares.filter(s => !s.revoked_at);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
      <div
        data-testid="share-modal"
        className="rounded-xl shadow-2xl overflow-hidden w-[560px] max-w-[92vw] max-h-[88vh] flex flex-col bg-surface-container border border-outline-variant"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-outline-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">share</span>
          <h3 className="text-sm font-semibold text-on-surface m-0 flex-1">{t('share.title')}</h3>
          <button
            className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-on-surface cursor-pointer"
            onClick={closeModal}
            aria-label={t('common.close')}
          >
            close
          </button>
        </div>

        {!authed ? (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">lock</span>
            <p className="text-sm text-on-surface-variant m-0">{t('share.loginRequired')}</p>
          </div>
        ) : currentId === null ? (
          <div className="p-6 flex flex-col items-center gap-4 text-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">cloud_off</span>
            <p className="text-sm text-on-surface-variant m-0">
              {t('share.saveFirstBefore')}{' '}<strong className="text-primary">{t('share.saveFirstStrong')}</strong>{t('share.saveFirstAfter')}
            </p>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            <p className="text-xs text-on-surface-variant m-0 leading-relaxed">
              <strong className="text-on-surface">{currentName}</strong>{' '}
              {t('share.intro1')}{' '}
              <strong className="text-on-surface">{t('share.introStrong')}</strong>{' '}
              {t('share.intro2')}
            </p>

            {/* 링크 발급 */}
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">{t('share.linkLabel')}</span>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder={t('share.linkPlaceholder')}
                  maxLength={100}
                  className="bg-surface border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:border-primary outline-none"
                />
              </label>
              <button
                data-testid="share-create"
                disabled={busy}
                onClick={issue}
                className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-inverse-primary hover:text-white transition-colors cursor-pointer active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
              >
                {t(busy ? 'share.creating' : 'share.createViewerLink')}
              </button>
            </div>

            {issued && (
              <div data-testid="share-issued" className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  {t('share.created')}
                </span>
                <div className="relative">
                  <pre
                    data-testid="share-link"
                    className="bg-surface border border-outline-variant rounded-lg p-3 pr-10 text-[11px] leading-relaxed text-on-surface font-mono whitespace-pre-wrap break-all m-0"
                  >{shareUrl(issued.token)}</pre>
                  <button
                    data-testid="share-copy"
                    onClick={() => copy(shareUrl(issued.token))}
                    title={t('common.copy')}
                    className="absolute top-2 right-2 material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary cursor-pointer"
                  >
                    {copied ? 'check' : 'content_copy'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2" data-testid="share-error">{error}</div>
            )}

            {/* 발급된 링크 목록 */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-on-surface-variant">{t('share.linksLabel')}</span>
              <div data-testid="share-list" className="flex flex-col gap-1">
                {activeShares.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded border border-outline-variant text-xs text-on-surface">
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">link</span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-surface-variant text-[10px] uppercase tracking-wide">
                      {t(s.role === 'editor' ? 'share.roleEditor' : 'share.roleViewer')}
                    </span>
                    <span className="flex-1 truncate">{s.label || t('share.unnamed')}</span>
                    <span className="text-[10px] text-outline shrink-0">{t(s.last_used_at ? 'share.used' : 'share.unused')}</span>
                    <button
                      onClick={() => revoke(s.id)}
                      title={t('share.revoke')}
                      aria-label={`Revoke share ${s.id}`}
                      className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-red-400 cursor-pointer shrink-0"
                    >
                      delete
                    </button>
                  </div>
                ))}
                {activeShares.length === 0 && (
                  <div className="px-3 py-1 text-xs text-outline italic">{t('share.empty')}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
