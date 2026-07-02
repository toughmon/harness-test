# 도메인 연결 + HTTPS 설정 (nginx + certbot)

`server/index.js`(Fastify)는 **8080 포트에만** 리스닝한다. 브라우저는 도메인만 입력하면 80(http)/443(https)으로 접속을 시도하므로, 도메인을 연결하려면 **80/443 → 8080 리버스 프록시**가 별도로 필요하다. 이 문서는 그 설정 절차를 다룬다 (대상 OS: Ubuntu).

> DNS(도메인 → 서버 IP 연결)는 이 문서의 범위 밖이다. 호스팅업체 콘솔에서 A 레코드를 서버 IP로 연결한 뒤 `nslookup <도메인>`으로 정상 해석되는 것까지 확인하고 이 문서를 진행한다.

## 0. 사전 확인

```bash
curl -I http://127.0.0.1:8080/     # 앱이 8080에서 정상 응답하는지 먼저 확인
nslookup <도메인>                   # 도메인이 이 서버 IP로 해석되는지 확인
```

## 1. nginx 설치

```bash
sudo apt update
sudo apt install -y nginx
```

## 2. 리버스 프록시 설정 (80 → 8080)

```bash
sudo tee /etc/nginx/sites-available/<도메인> > /dev/null <<'EOF'
server {
    listen 80;
    server_name <도메인>;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/<도메인> /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # 기본 welcome 페이지 비활성화
sudo nginx -t && sudo systemctl reload nginx
```

> heredoc(`<<'EOF' ... EOF`) 블록은 **전체가 하나의 명령**이다. `sudo tee ... <<'EOF'`부터 맨 아래 `EOF`까지 한 번에 붙여넣는다. 마지막 `EOF`는 **줄 맨 앞(공백 없이)**에 있어야 종료 표시로 인식된다 — 앞에 공백이 있으면 heredoc이 안 끝나고 터미널이 `>` 프롬프트로 멈춘다.

**확인**: `http://<도메인>/`이 앱 화면으로 열리면 성공. (브라우저 이전 캐시로 헷갈리면 시크릿 창으로 확인)

## 3. 방화벽

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```
OS 방화벽(ufw)과 별개로, **호스팅사 콘솔의 네트워크/보안 설정**에도 80·443 TCP 인바운드 허용이 필요한 경우가 많다(cafe24 클라우드 서버 등). 인증서 발급이 계속 실패하면 이 부분부터 의심.

## 4. certbot으로 SSL 발급

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <도메인>
```
- 이메일 입력, 약관 동의
- **"Redirect" 여부를 물으면 2번(Redirect) 선택** — http 요청을 https로 자동 전환
- 성공 시 `/etc/nginx/sites-available/<도메인>`에 443 서버 블록 + 인증서 경로 + 80→443 리다이렉트가 **자동으로 추가**됨 (직접 편집 불필요)
- 인증서: `/etc/letsencrypt/live/<도메인>/fullchain.pem`(공개) + `privkey.pem`(개인키, 서버 전용 — 브라우저엔 노출되지 않음)

**확인**:
```bash
sudo nginx -t
curl -I https://<도메인>
```
`HTTP/2 200`이면 성공.

## 5. 자동 갱신

Let's Encrypt 인증서는 **90일** 유효(짧게 줘서 자동화를 강제하는 정책 — 정상이며 걱정할 부분 아님). certbot 설치 시 systemd 타이머(`certbot.timer`)가 자동 등록되어 하루 2회 만료 임박 인증서를 확인·갱신한다. 사람이 개입할 필요 없음.

```bash
systemctl list-timers | grep certbot   # 다음 실행 예정 확인
sudo certbot renew --dry-run           # 갱신 시뮬레이션
sudo certbot certificates              # 만료일·자동갱신 대상 확인
```

계속 자동 갱신되기 위한 전제 조건:
- 서버가 계속 가동 중일 것 (재부팅해도 타이머는 자동 재활성화됨)
- 80번 포트가 계속 외부에 열려 있을 것 (갱신마다 HTTP-01 챌린지 재수행)
- DNS가 계속 이 서버를 가리킬 것
- `certbot` 패키지·`/etc/letsencrypt`를 지우지 않을 것

갱신 실패 시 certbot 설정 시 입력한 이메일로 Let's Encrypt가 만료 임박 경고 메일을 보낸다(안전장치).

## 6. (권장) NODE_ENV=production 설정

HTTPS가 붙으면 로그인 쿠키의 `secure` 플래그(`server/auth-routes.js`의 `COOKIE_OPTS.secure: process.env.NODE_ENV === 'production'`)를 정상 활성화하는 것이 좋다:
```bash
pm2 restart <프로세스명> --update-env
```
(`.env` 또는 pm2 ecosystem 설정에 `NODE_ENV=production` 필요. `DATABASE_URL` 미설정 상태에서 이 값을 켜면 `server/index.js`의 영속 DB 가드가 기동을 거부하니, 반드시 `DATABASE_URL`도 함께 설정돼 있어야 한다 — README.md "배포" 절 참고.)

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `tee: /etc/nginx/sites-available/<도메인>: No such file or directory` | nginx 미설치 또는 `sites-available` 디렉토리가 없는 배포판. `ls /etc/nginx/`로 확인 후, `conf.d` 방식 대안 사용(아래) |
| `http://<도메인>/`이 nginx 기본 welcome 페이지를 보여줌 | `sites-available`에 파일은 있지만 `sites-enabled`에 심볼릭 링크가 없어서 nginx가 안 읽는 상태. `ls -la /etc/nginx/sites-enabled/`로 확인 후 2번의 `ln -s` 재실행 |
| `curl -I http://<도메인>` connection refused (80/443) | 리버스 프록시 미설정 또는 방화벽 차단. `curl -I http://<도메인>:8080`로 앱 자체는 살아있는지 먼저 구분 |
| certbot 발급 실패 | 대부분 80번 포트 미개방(호스팅사 콘솔 방화벽) 또는 DNS 미전파. `nslookup <도메인>`으로 DNS부터 재확인 |
| 로그인이 https에서만 되고 http에서 안 됨 | `NODE_ENV=production`이 설정된 상태에서 인증서 발급 전 http로 접속한 경우. Secure 쿠키는 HTTPS 필수 — 정상 동작이며, https로 접속하면 해결됨 |

### `sites-available` 대신 `conf.d` 방식 (디렉토리가 없는 경우)

```bash
sudo mkdir -p /etc/nginx/conf.d

sudo tee /etc/nginx/conf.d/<도메인>.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name <도메인>;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo nginx -t && sudo systemctl reload nginx
```
`conf.d/*.conf`는 `nginx.conf`가 기본으로 include하므로 `sites-enabled` 심볼릭 링크 단계가 필요 없다. 이후 certbot 실행은 동일(`sudo certbot --nginx -d <도메인>`), 대상 파일만 `conf.d/<도메인>.conf`로 다르다.
