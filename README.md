# HiveDesk (Pixel Trading Floor) — 연구 기반 트레이딩 봇

TradingAgents식 멀티 에이전트 트레이딩 파이프라인을 Claude 구독 계정으로 돌리는 데스크톱 모의거래/자동매매 데스크입니다. Electron 데스크톱 앱 + Next.js 웹 콘솔 + 다운로드 사이트로 구성됩니다.

- 웹: https://ubuntu.tail543772.ts.net/hivedesk
- 릴리스: https://github.com/Honri314/HiveDesk/releases

## 구성 요소

| 폴더 | 내용 |
|---|---|
| `app/` | Electron 데스크톱 앱 본체 — "픽셀 오피스" UI와 에이전트 파이프라인, 모의거래, 자동매매 스케줄러 |
| `web/` | Next.js 15 + React 19 웹 콘솔 (`@anthropic-ai/claude-agent-sdk` + better-sqlite3) — 서버 세션(JWT 서명, AUTH_SECRET), 관리자 이메일 자동 승급(ADMIN_EMAILS), DB 연동 |
| `site/` | 다운로드 홈페이지 (인덱스/가이드). `site/release/manifest.json`이 있으면 파일 링크를 자동으로 최신 빌드로 교체 |
| `.env` | 실제 시크릿(AUTH_SECRET, ENGINE_SECRET, DATABASE_URL 등). 커밋되지 않으며 `.env.example` 양식만 참고 |

## 데스크톱 앱 (app/, 버전 0.2.4)

- macOS / Windows(Electron 33), UI와 에이전트 발화 전부 한국어
- Claude 연동: API 키 입력 없음 — 로컬 `claude` CLI의 구독 로그인 세션을 재사용. 미연동/오프라인이면 데모(룰베이스 페르소나) 모드로 동일 파이프라인 시연
- 모의거래 전용 설계 (실주문 없음) + 안전 게이트(rule 3): 주문 실행기(executor)가 위험 제한 통과 여부를 검사

### 핵심 모듈 (app/src/)
| 파일 | 역할 |
|---|---|
| `pipeline.ts` | TradingAgents 역할 구조 파이프라인 — 애널리스트 4명 → 토론 → 트레이더 → 리스크 → PM 순 회의 |
| `claude.ts` | Claude 연결 계층: CLI 감지, SDK 러너, 발화 생성/파싱 |
| `market.ts` | 시세 — 공개 엔드포인트만 사용(Yahoo chart API: 주식, Binance: 코인) + 기술 지표 계산 |
| `store.ts` | SQLite 영속화(better-sqlite3). 포트폴리오/주문/회의 기록 |
| `vault.ts` | 암호화 키 보관소(안전 규칙 반영 — 키는 원격 전송되지 않음) |
| `executor.ts` | 안전 게이트가 있는 주문 실행기 |
| `scheduler.ts` | 자동매매 스케줄러 (장중/장마다 조건 기반 자동 실행) |
| `brokers/` | 브로커 어댑터(모의/연계 확장 지점) |

### UI (app/renderer/)
- 픽셀 오피스 3방 뷰(officeFloor.ts) — 에이전트들이 회의 장에 앉아 발화하는 시각화, 회의 재생, 포트폴리오, 연동 설정 탭
- 빌드는 esbuild 번들링(`npm run build`: tsc → renderer/js/app.js → dist 복사)

## Claude 연동 흐름 (사용자)
1. 앱 연동 탭에서 CLI 부재 시 `npm i -g @anthropic-ai/claude-code` 안내를 표시
2. 터미널에서 `claude`를 실행하고 브라우저 로그인(구독 사용) → 앱 재시작 시 자동 인식
3. 이후 회의부터 실제 Claude 발화가 생성되고, 미연동 시엔 페르소나 나래이션으로 동작

## 웹 콘솔 (web/)
- Next.js 15(App Router) + better-sqlite3 + claude-agent-sdk. `serverExternalPackages`로 네이티브 모듈을 서버 전용 처리
- 세션은 Next.js JWT(Cookie) 서명(AUTH_SECRET), 기 최초 가입자 자동 관리자, HTTPS 가변(COOKIE_SECURE)
- `.env`의 ENGINE_URL/ENGINE_SECRET은 별도 분석 엔진(별도 호스팅)과의 HMAC 요청 서명용 — 엔진 코드는 이 리포 밖에서 배포됩니다
- 실행: `npm i && npm run dev` (web/ 폴더). build는 `next build`

## 빌드/패키징 (app/)
```
npm install
npm run typecheck          # tsc --noEmit
npm run build && npm start # 개발 실행
npm run dist:mac           # release/ 아래 dmg+zip (arm64)
npm run dist:win           # Windows 실피에서 빌드 권장 (better-sqlite3 prebuilt)
```

## 데이터/보안 규칙
- 모든 주문은 모의 거래이며 실거래소 키를 요구하지 않습니다. 시세는 공개 API만 사용.
- 거래 키가 필요한 연계 확장 시 vault.ts로 암호화 보관하고(원격 전송 금지), .env/시크릿은 커밋 금지입니다.
- 커밋 서명은 GitHub noreply 이메일(개인정보 노출 아님)을 씁니다.
