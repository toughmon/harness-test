// 인증 라우트 — 아이디/비밀번호 가입·로그인, JWT httpOnly 쿠키
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SCRYPT_N = 16384;
const KEYLEN = 32;

async function hashPassword(pw) {
  const salt = randomBytes(16);
  const buf = await scryptAsync(pw, salt, KEYLEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${buf.toString('base64')}`;
}

async function verifyPassword(pw, stored) {
  const [algo, n, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const buf = await scryptAsync(pw, salt, expected.length, { N: Number(n) });
  return buf.length === expected.length && timingSafeEqual(buf, expected);
}

const credentialsSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-zA-Z0-9_.-]+$' },
      password: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
};

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 7, // 7일
};

export default async function authRoutes(app) {
  const setAuthCookie = (reply, user) => {
    const token = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: '7d' });
    reply.setCookie('token', token, COOKIE_OPTS);
  };

  // 가입 — 성공 시 자동 로그인
  app.post('/register', { schema: credentialsSchema }, async (req, reply) => {
    const { username, password } = req.body;
    // pg-mem 호환을 위해 unique 위반 catch 대신 사전 SELECT로 중복 확인
    const dup = await app.db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (dup.rows.length > 0) {
      return reply.code(409).send({ error: 'username_taken' });
    }
    const pwHash = await hashPassword(password);
    const res = await app.db.query(
      'INSERT INTO users (username, pw_hash) VALUES ($1, $2) RETURNING id, username',
      [username, pwHash]
    );
    const user = res.rows[0];
    setAuthCookie(reply, user);
    return reply.code(201).send({ id: user.id, username: user.username });
  });

  // 로그인
  app.post('/login', { schema: credentialsSchema }, async (req, reply) => {
    const { username, password } = req.body;
    const res = await app.db.query('SELECT id, username, pw_hash FROM users WHERE username = $1', [username]);
    const user = res.rows[0];
    if (!user || !(await verifyPassword(password, user.pw_hash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    setAuthCookie(reply, user);
    return { id: user.id, username: user.username };
  });

  // 로그아웃
  app.post('/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });

  // 세션 확인 (앱 시작 시 세션 복원용)
  app.get('/me', async (req, reply) => {
    try {
      await req.jwtVerify();
      return { id: req.user.id, username: req.user.username };
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
}
