import { useEffect } from 'react';
import Toolbar from './components/toolbar/Toolbar';
import Sidebar from './components/sidebar/Sidebar';
import ERDCanvas from './components/canvas/ERDCanvas';
import EntityEditPanel from './components/panels/EntityEditPanel';
import RelationshipEditPanel from './components/panels/RelationshipEditPanel';
import MemoEditPanel from './components/panels/MemoEditPanel';
import MultiSelectPanel from './components/panels/MultiSelectPanel';
import AuthModal from './components/auth/AuthModal';
import DialogModal from './components/common/DialogModal';
import McpConnectModal from './components/mcp/McpConnectModal';
import ShareModal from './components/share/ShareModal';
import { useERDStore } from './store/erdStore';
import { useAuthStore } from './store/authStore';
import { useDiagramStore } from './store/diagramStore';
import { useMcpStore } from './store/mcpStore';
import { useShareStore } from './store/shareStore';
import { useSharedSessionStore } from './store/sharedSessionStore';
import { useThemeStore } from './store/themeStore';
import { useLocaleStore } from './i18n';
import { confirmDeleteEntity, confirmDeleteRelationship, confirmDeleteMemo, confirmDeleteMany } from './store/deleteActions';
import { SAMPLE_KEYS, type SampleKey } from './data/sampleDiagrams';

// 공유 링크 진입 파싱 — /d/:token 또는 ?share=<token> (라우터 미도입, SPA fallback이 index.html 서빙)
function parseShareToken(): string | null {
  const m = window.location.pathname.match(/^\/d\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(window.location.search).get('share');
}

// 공개 예제 페이지에서 `/app?sample=ecommerce`처럼 특정 샘플을 바로 열 수 있게 한다.
// 허용 목록으로 한정해, 임의의 쿼리가 편집기 상태를 바꾸지 않도록 한다.
function parseSampleKey(): SampleKey | null {
  const value = new URLSearchParams(window.location.search).get('sample');
  return value !== null && SAMPLE_KEYS.includes(value as SampleKey) ? value as SampleKey : null;
}

// 최초 방문 예제 자동 로드를 "한 번만" 하기 위한 플래그. 값 자체는 의미 없고 존재 여부만 본다.
const SAMPLE_SEEN_KEY = 'erd_sample_intro_shown';

function App() {
  const { undo, redo } = useERDStore();
  const selectedEntityId = useERDStore(s => s.selectedEntityId);
  const selectedEdgeId = useERDStore(s => s.selectedEdgeId);
  const selectedMemoId = useERDStore(s => s.selectedMemoId);
  const selectedEntityIds = useERDStore(s => s.selectedEntityIds);
  const selectedMemoIds = useERDStore(s => s.selectedMemoIds);
  const isMultiSelect = selectedEntityIds.length + selectedMemoIds.length > 1;
  const { modalOpen, init, status } = useAuthStore();
  const readOnly = useERDStore(s => s.readOnly);
  const autoSave = useDiagramStore(s => s.autoSave);
  const mcpModalOpen = useMcpStore(s => s.modalOpen);
  const shareModalOpen = useShareStore(s => s.modalOpen);
  const sharedError = useSharedSessionStore(s => s.error);
  const { theme } = useThemeStore();
  const locale = useLocaleStore(s => s.locale);

  // 앱 시작 시 세션 복원 (쿠키의 JWT로 GET /me). 공유 링크 진입 시 내 마지막 다이어그램 복원은 건너뛰고 공유본을 연다.
  useEffect(() => {
    const token = parseShareToken();
    const sample = parseSampleKey();
    // 샘플을 명시적으로 열었을 때는 마지막 작업물을 먼저 복원하지 않는다. 그래야
    // 예제 링크가 기존 다이어그램을 잠깐 덮어쓰거나, 복원 직후 버려지는 일이 없다.
    init(!!token || !!sample).then(async () => {
      if (token) useSharedSessionStore.getState().enter(token);
      if (sample) {
        await useDiagramStore.getState().loadSample(sample);
        // 적용 뒤 URL을 정리한다. 새로고침·링크 복사 시에도 이미 의도대로 열렸던
        // 샘플이 다시 작업 중인 캔버스를 바꾸지 않게 한다.
        const url = new URL(window.location.href);
        url.searchParams.delete('sample');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    });
  }, [init]);

  // 랜딩·정책 페이지(정적 HTML)에서 고른 언어를 이어받는다 — `/app?lang=ko|en`.
  // 정적 페이지는 스토어에 접근할 수 없어 쿼리로 넘기고, 여기서 공개 API로 반영한다
  // (persist의 localStorage 포맷을 정적 페이지에 복제하지 않기 위함).
  // 반영 후 파라미터를 지워, 새로고침이나 링크 공유 때 언어가 다시 강제되지 않게 한다.
  // parseShareToken이 ?share= 를 읽은 뒤에 실행되도록 위 effect 다음에 둔다.
  useEffect(() => {
    const lang = new URLSearchParams(window.location.search).get('lang');
    if (lang !== 'ko' && lang !== 'en') return;
    useLocaleStore.getState().setLocale(lang);
    const url = new URL(window.location.href);
    url.searchParams.delete('lang');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  // 로그인 필요로 대기 중이던 공유 세션 — 로그인 완료되면 재시도
  useEffect(() => {
    const ss = useSharedSessionStore.getState();
    if (status === 'authed' && ss.token && ss.needsLogin) {
      ss.enter(ss.token);
    }
  }, [status]);

  // 진짜 최초 방문자에게만 — 완전히 빈 캔버스 대신 예제 다이어그램을 한 번 보여준다.
  // status==='anon' 확정(로그인 세션 없음) + 공유 링크 진입 아님 + 이 브라우저에서 한 번도
  // 보여준 적 없음(SAMPLE_SEEN_KEY) + 캔버스가 실제로 비어 있을 때만 발동. 로그인 사용자는
  // authStore.init()이 restoreLastOpened()로 마지막 다이어그램을 복원하므로 대상에서 자동 제외되고,
  // 비로그인 재방문자는 (기존 그대로) 항상 빈 캔버스로 시작 — 플래그 없이 매번 로드하면
  // "새로 시작하기"로 지운 캔버스에 새로고침할 때마다 샘플이 다시 끼어드는 꼴이 되어 버린다.
  //
  // navigator.webdriver 가드: Playwright/Selenium 등 자동화 브라우저는 이 값이 true로
  // 노출된다(CDP 자동화 컨트롤 활성화 시 Chromium이 표준으로 세팅). 이게 없으면 e2e
  // 스크립트마다 새 브라우저 컨텍스트(=localStorage 빈 "최초 방문자")로 뜨면서 기존 40여
  // 개 시나리오가 전제하던 "빈 캔버스"가 깨져 대량 회귀가 났다(실제로 재현·확인함).
  // 자동화 감지는 실사용자 경험에 영향이 없고(사람은 이 플래그가 false), 온보딩 편의
  // 기능이 테스트 인프라를 오염시키지 않게 막는 실용적인 경계선이다.
  useEffect(() => {
    if (status !== 'anon') return;
    if (navigator.webdriver) return;
    if (parseShareToken()) return;
    if (parseSampleKey()) return;
    if (localStorage.getItem(SAMPLE_SEEN_KEY)) return;
    if (useERDStore.getState().entities.length > 0) return;
    localStorage.setItem(SAMPLE_SEEN_KEY, '1');
    void useDiagramStore.getState().loadSample('ecommerce');
  }, [status]);

  // 로그인 상태일 때 5초마다 자동 저장 (currentId 없는 새 다이어그램은 skip)
  useEffect(() => {
    if (status !== 'authed') return;
    const id = setInterval(autoSave, 5000);
    return () => clearInterval(id);
  }, [status, autoSave]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 선택한 UI 언어를 문서에도 반영 — 스크린리더·번역기·:lang() 선택자가 이 값을 읽는다
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // 전역 Undo/Redo + 엔티티 삭제 단축키 — 입력 필드 포커스 중에는 브라우저 기본 동작 유지
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return;
      }
      if (readOnly) return;   // 공유 뷰어: undo/redo·Delete 등 모든 편집 단축키 비활성
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
        }
        return;
      }
      if (e.key === 'Delete' && isMultiSelect) {
        e.preventDefault();
        void confirmDeleteMany(selectedEntityIds, selectedMemoIds);
      } else if (e.key === 'Delete' && selectedEntityId) {
        e.preventDefault();
        void confirmDeleteEntity(selectedEntityId);
      } else if (e.key === 'Delete' && selectedEdgeId) {
        e.preventDefault();
        void confirmDeleteRelationship(selectedEdgeId);
      } else if (e.key === 'Delete' && selectedMemoId) {
        e.preventDefault();
        void confirmDeleteMemo(selectedMemoId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, selectedEntityId, selectedEdgeId, selectedMemoId, readOnly, isMultiSelect, selectedEntityIds, selectedMemoIds]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-background text-on-surface font-sans">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />
        <ERDCanvas />
        {isMultiSelect && <MultiSelectPanel />}
      </div>
      {/* 편집 모달 — 우측 고정 패널 대신 info/✎ 아이콘·우클릭 편집으로 열림. 각자 editorOpen을 보고 자체 게이팅 */}
      <EntityEditPanel />
      <RelationshipEditPanel />
      <MemoEditPanel />
      {modalOpen && <AuthModal />}
      {mcpModalOpen && <McpConnectModal />}
      {shareModalOpen && <ShareModal />}
      {sharedError && (
        <div
          data-testid="shared-error"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg"
        >
          {sharedError}
        </div>
      )}
      <DialogModal />
    </div>
  );
}

export default App;
