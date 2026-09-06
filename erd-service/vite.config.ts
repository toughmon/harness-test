import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// 앱 셸(app.html)로 서빙해야 하는 클라이언트 경로.
// - /app, /app/*  : 편집기
// - /d/:token     : 공유 링크 진입 (App.tsx의 parseShareToken이 pathname을 읽는다)
// 이 목록은 server/index.js의 SPA fallback 판정과 의도적으로 동일하게 유지한다.
// (여기서 넓히면 dev만 통과하고 프로덕션에서 404가 나는 어긋남이 생긴다)
const APP_SHELL = /^\/(?:app(?:\/|$)|d\/[^/]+\/?$)/

const PUBLIC_DIR = resolve(import.meta.dirname, 'public')

// dev 서버에서 확장자 없는 경로를 프로덕션과 같은 파일로 넘긴다.
// 프로덕션은 Fastify(+@fastify/static)가 같은 일을 하므로, 이 플러그인은 dev/prod 동작을 맞추는 용도다.
function appShellDev() {
  return {
    name: 'yourerd-app-shell-dev',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
      // configureServer 본문에서 등록한 미들웨어는 Vite 내부 미들웨어보다 먼저 실행된다.
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '').split('?')[0]

        if (APP_SHELL.test(path)) {
          req.url = '/app.html'
          return next()
        }

        // 디렉터리 요청(/en, /en/)을 public/<dir>/index.html로 해석한다.
        // 없으면 Vite의 SPA fallback이 루트 index.html(한국어 랜딩)을 200으로 돌려주기 때문에,
        // dev에서만 /en/이 한국어로 뜨는 어긋남이 생겼다. 프로덕션 정적 서버는 원래 이걸 해준다.
        // 문자 클래스에 점이 없어 상위 경로(..) 탈출은 애초에 매칭되지 않는다.
        const dir = path.replace(/\/+$/, '')
        if (dir && /^\/[\w-]+(?:\/[\w-]+)*$/.test(dir) && existsSync(resolve(PUBLIC_DIR, `.${dir}`, 'index.html'))) {
          req.url = `${dir}/index.html`
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), appShellDev()],
  build: {
    rollupOptions: {
      input: {
        // 루트(/)는 정적 랜딩 페이지, 편집기는 /app에서 app.html로 서빙된다.
        // 랜딩을 index.html로 둔 이유: 크롤러가 첫 진입에서 읽을 실제 콘텐츠가 있어야 한다.
        main: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app.html'),
      },
    },
  },
  server: {
    // dev에서 API·WS는 로컬 Fastify(npm start, 8080)로 프록시 — 쿠키 same-origin 유지
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
})
