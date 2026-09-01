import { useRef, useState } from 'react';
import { useERDStore } from '../../store/erdStore';
import { useAuthStore } from '../../store/authStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useThemeStore } from '../../store/themeStore';
import { useT, useLocaleStore } from '../../i18n';
import { useShareStore } from '../../store/shareStore';
import { useCollabStore } from '../../store/collabStore';
import { useSharedSessionStore } from '../../store/sharedSessionStore';
import type { Participant } from '../../collab/protocol';
import { saveERD, loadERD } from '../../utils/fileIO';
import { fromERDData } from '../../utils/erdData';
import { alertDialog } from '../../store/dialogStore';

// 접속자 아바타 클러스터 (presence)
function Presence({ participants }: { participants: Participant[] }) {
  const t = useT();
  if (participants.length === 0) return null;
  return (
    <div
      data-testid="collab-participants"
      data-count={participants.length}
      className="flex items-center -space-x-1.5 mr-1"
      title={t('toolbar.participants', { n: participants.length })}
    >
      {participants.slice(0, 5).map(p => {
        const name = p.label ?? t('collab.guest');
        return (
        <div
          key={p.actorId}
          className="w-7 h-7 rounded-full border-2 border-surface flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: p.color }}
          title={t(
            p.role === 'viewer' ? 'toolbar.participant.viewer'
              : p.role === 'owner' ? 'toolbar.participant.owner'
              : 'toolbar.participant.plain',
            { name },
          )}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        );
      })}
      {participants.length > 5 && (
        <div className="w-7 h-7 rounded-full border-2 border-surface bg-surface-variant text-on-surface-variant flex items-center justify-center text-[10px] font-bold">
          +{participants.length - 5}
        </div>
      )}
    </div>
  );
}

// 디자인 시안의 TopNavBar — 편집 컨트롤 + 로그인 시 DB 저장/공유 + 협업 presence.
// 공유 뷰어(읽기 전용)일 때는 편집 컨트롤을 숨기고 읽기 전용 배지·나가기를 노출한다.
export default function Toolbar() {
  const {
    entities, relationships, nodePositions, memos, loadData,
    undo, redo, past, future, readOnly,
  } = useERDStore();
  const { user, status, openModal, logout } = useAuthStore();
  const { currentId, dirty, saving, list, saveCurrent } = useDiagramStore();
  const { theme, toggleTheme } = useThemeStore();
  const { locale, toggleLocale } = useLocaleStore();
  const t = useT();
  const openShare = useShareStore(s => s.openModal);
  const collabStatus = useCollabStore(s => s.status);
  const participants = useCollabStore(s => s.participants);
  const leaveShared = useSharedSessionStore(s => s.leave);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const currentName = currentId !== null ? list.find(d => d.id === currentId)?.name : null;
  const collabLive = collabStatus === 'live';

  const handleSave = () => {
    saveERD(entities, relationships, nodePositions, memos);
  };

  const handleLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await loadERD(file);
      const { entities: loaded, relationships: rels, positions, memos: loadedMemos } = fromERDData(data);
      loadData(loaded, rels, positions, loadedMemos);
    } catch (err) {
      alertDialog((err as Error).message, t('toolbar.openFailed'));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <header className="flex justify-between items-center h-12 px-8 w-full z-50 shrink-0 bg-surface border-b border-outline-variant">
      <div className="flex items-center gap-4">
        <div className="text-[22px] leading-8 tracking-tight font-black text-primary">YourERD</div>
        {currentName && !readOnly && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-on-surface-variant font-mono" data-testid="current-diagram">
            <span className="material-symbols-outlined text-[16px]">cloud</span>
            {currentName}
            {dirty && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" title={t('toolbar.unsavedChanges')} />}
          </div>
        )}
        {readOnly && (
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-mono" data-testid="shared-session">
            <span className="material-symbols-outlined text-[16px] text-primary">groups</span>
            {t('toolbar.sharedSession')}
          </div>
        )}
      </div>

      {/* 협업 상태 훅(테스트/디버그용, 비표시) */}
      <span data-testid="collab-status" data-status={collabStatus} className="hidden" />

      <div className="flex items-center gap-2">
        {collabLive && <Presence participants={participants} />}

        {readOnly ? (
          <>
            <span
              data-testid="readonly-badge"
              className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant bg-surface-variant px-2.5 py-1 rounded-full"
            >
              <span className="material-symbols-outlined text-[15px]">visibility</span>
              {t('toolbar.readOnly')}
            </span>
            <button
              data-testid="leave-share"
              className="text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold px-3 py-1.5 rounded border border-outline-variant cursor-pointer"
              onClick={leaveShared}
              title={t('toolbar.leaveShared')}
            >
              {t('toolbar.leave')}
            </button>
          </>
        ) : (
          <>
            {/* Undo / Redo */}
            <button
              className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:hover:text-on-surface-variant"
              onClick={undo}
              disabled={past.length === 0}
              title={t('toolbar.undo')}
              aria-label="Undo"
            >
              <span className="material-symbols-outlined text-[20px]">undo</span>
            </button>
            <button
              className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:hover:text-on-surface-variant"
              onClick={redo}
              disabled={future.length === 0}
              title={t('toolbar.redo')}
              aria-label="Redo"
            >
              <span className="material-symbols-outlined text-[20px]">redo</span>
            </button>
            <div className="w-px h-5 bg-outline-variant mx-1" />

            {/* 공유 (로그인 + DB 저장된 다이어그램에서만) */}
            {status === 'authed' && currentId !== null && (
              <button
                data-testid="share-btn"
                className="text-on-surface-variant hover:text-primary transition-colors px-2 py-1.5 rounded flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                onClick={openShare}
                title={t('toolbar.createShareLink')}
                aria-label="Share"
              >
                <span className="material-symbols-outlined text-[18px]">share</span>
                {t('toolbar.share')}
              </button>
            )}

            {/* DB 저장 (로그인 시에만) */}
            {status === 'authed' && (
              <button
                className="bg-primary text-on-primary hover:bg-inverse-primary hover:text-white px-3 py-1.5 rounded transition-colors text-xs font-mono font-semibold cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-default flex items-center gap-1.5"
                onClick={saveCurrent}
                disabled={saving || entities.length === 0}
                title={t(currentId !== null ? 'toolbar.saveDbOverwrite' : 'toolbar.saveDbNew')}
                aria-label="DB Save"
              >
                <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                {t(saving ? 'toolbar.saving' : 'toolbar.saveDb')}
              </button>
            )}

            {/* Save (JSON 파일 다운로드) */}
            <button
              className="bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary px-4 py-1.5 rounded transition-colors text-xs font-mono font-semibold cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-default"
              onClick={handleSave}
              disabled={entities.length === 0}
            >
              Save
            </button>

            {/* 불러오기 */}
            <button
              className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              title={t('toolbar.openJson')}
              aria-label="Open file"
            >
              <span className="material-symbols-outlined text-[20px]">folder_open</span>
            </button>
          </>
        )}

        <div className="flex items-center gap-2 border-l border-outline-variant pl-4 ml-2">
          <button
            aria-label="Toggle language"
            data-testid="locale-toggle"
            className="text-on-surface-variant hover:text-primary transition-colors px-1 py-1 cursor-pointer flex items-center gap-1"
            title={t('toolbar.toggleLocale')}
            onClick={toggleLocale}
          >
            <span className="material-symbols-outlined text-[20px]">translate</span>
            <span className="font-mono text-[11px] font-bold tracking-wider">{locale.toUpperCase()}</span>
          </button>
          <button
            aria-label="Toggle theme"
            data-testid="theme-toggle"
            className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer"
            title={t(theme === 'dark' ? 'toolbar.toLightMode' : 'toolbar.toDarkMode')}
            onClick={toggleTheme}
          >
            <span className="material-symbols-outlined text-[20px]">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <button aria-label="Notifications" className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-default" title={t('toolbar.notifications')}>
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>
          <button aria-label="Settings" className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-default" title={t('toolbar.settings')}>
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>
          {/* 사용자 아바타 — anon: 로그인 모달, authed: 드롭다운(로그아웃) */}
          <div className="relative ml-2">
            <button
              className={`w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                status === 'authed'
                  ? 'border-primary bg-primary text-on-primary font-bold text-sm'
                  : 'border-outline-variant bg-secondary-container text-on-secondary-container hover:border-primary'
              }`}
              title={status === 'authed' ? user?.username : t('toolbar.login')}
              aria-label="User"
              onClick={() => {
                if (status === 'authed') setUserMenuOpen(o => !o);
                else openModal();
              }}
            >
              {status === 'authed' && user ? (
                user.username.charAt(0).toUpperCase()
              ) : (
                <span className="material-symbols-outlined text-[18px]">person</span>
              )}
            </button>
            {userMenuOpen && status === 'authed' && (
              <div className="absolute right-0 top-10 z-50 min-w-40 rounded-lg shadow-2xl bg-surface-container border border-outline-variant py-1">
                <div className="px-4 py-2 text-xs text-on-surface-variant border-b border-outline-variant font-mono" data-testid="user-name">
                  {user?.username}
                </div>
                <button
                  className="w-full text-left px-4 py-2 text-xs text-on-surface hover:bg-surface-variant transition-colors cursor-pointer"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                >
                  {t('toolbar.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleLoad}
      />
    </header>
  );
}
