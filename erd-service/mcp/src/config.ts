// 환경변수 설정 — 배포된 ERD 서비스 주소와 MCP 전용 서비스 계정 자격증명.
// ERD_BASE_URL 미설정 시 로컬(localhost:8080)로 폴백(개발/검증용).

export interface Config {
  baseUrl: string;
  username: string;
  password: string;
  diagramId: number | null; // 선택적 사전 선택 다이어그램
}

export function getConfig(): Config {
  const baseUrl = (process.env.ERD_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
  const username = process.env.ERD_USERNAME ?? '';
  const password = process.env.ERD_PASSWORD ?? '';
  const rawId = process.env.ERD_DIAGRAM_ID;
  const diagramId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;
  return { baseUrl, username, password, diagramId };
}
