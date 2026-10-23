# 빌드 기록 (buildlog.md)

> 최신 기록이 아래에 추가된다. 형식: `[날짜] 단계 — 한 일 / 검증 결과`

---

## 2026-10-07

- [사전 정리] 기존 AgentTrade 프로젝트(web/engine) 전체를 `old/`로 이동 보존. 신규 생성 파일 제거 확인.
- [조사] TradingAgents(v0.6.0, LangGraph 파이프라인: 애널리스트 4 → 불/베어 토론 → 리서치 매니저 → 트레이더 → 리스크 → PM)와
  munder-difflin(Electron, claude/codex 등 CLI를 구독 계정으로 스폰하는 오피스 하네스, GOD 오케스트레이터, 승인 큐) 구조 파악.
  결정: 파이프라인 구조는 TradingAgents에서, 오피스 비주얼/온보딩/승인 큐 개념은 munder-difflin에서 차용.
- [기술 선택] 스택 = **Electron + TypeScript + @anthropic-ai/claude-agent-sdk + better-sqlite3**.
  이유: Mac/Win 단일 코드베이스, Claude 구독 계정 로그인(SDK가 로컬 claude CLI를 스폰해 구독 인증 사용),
  데스크톱 오프라인 DB. 로컬 Python 3.12 존재하지만 패키징·SDK·토스 조합에서 Electron이 실용적.
- [스캐폴딩] `app/` Electron 프로젝트 골격: package.json(build=esbuild+electron-builder, asarUnpack=sqlite3+SDK),
  tsconfig(+build), .gitignore. `npm install` 백그라운드 진행(electron 44.6.0 / SDK 0.3.292).
- [문서] rule.md / buildlog.md 작성. 이후 모든 빌드 단계를 아래에 기록.

### 구현 및 검증 (10:20–10:52)

- [코어] src/ 구현: types(에이전트 10역할 정의), store(better-sqlite3: meetings/turns/decisions/orders/cash/settings),
  market(Yahoo 차트 API·Binance klines 연결 리다이렉션 처리, SMA/RSI/MACD, 한글 심볼 매핑, 오프라인 합성 데이터),
  claude(CLI 탐색—PATH+~/.local/bin—, ~/.claude.json oauth 프로필 감지, SDK query() 지연 로딩, 사용금지 도구 차단),
  pipeline(애널리스트4→강세/약세 토론→리서치 총괄→트레이더→리스크→PM, 데모 페르소나(첨/훗/크흠) 룰베이스,
  실패시 데모 폴백, 예산·확신도 게이트).
- [진실 검증 1] E2E: snapshot('BTC')=Yahoo 실데이터(RSI78, MA10 37.31>MA30 35.76→HOLD 근거), 파이프라인 10턴 생성,
  store 회전 등가(turns10/orders1/cash 10,000,000→9,995,000, 포지션 평단 50,000), 삼성전자=005930.KS Yahoo 273,500원.
  → exit 0.
- [버그1] qtcl 오류 3건: tsc strict에서 pipeline의 Snapshot 타입 누락 등 → 수정 후 --noEmit 0 에러.
- [버그2] better-sqlite3 v13.0.3 prebuild가 macOS 27 arm64에서 세그멘테이션 폴트 → v12.4.1로 교체.
- [버그3] Electron 44의 @electron/get이 ESM-only → require 불가 → Electron 33.4.11로 다운그레이드(20.x ABI·ESM 호환).
- [버그4] Node ABI(115)≠Electron ABI(130) → npm rebuild --runtime=electron --target=33.4.11 --dist-url=electronjs.org/headers로 해결.
- [버그5] 렌더러 번들 위치 — dist/electron/main.js의 상대경로 참조 오류 ERR_FILE_NOT_FOUND → copy:views 스크립트로
  dist/renderer/{index.html,css/,js/app.js} 배치.
- [실패 기록] Claude 미연동 환경에서 claude:status → 미연동 상태 렌더, 파이프라인 데모 폴백 확인.
  Claude API 실호출 비경로(permissionMode=plan, 모든 파일도구 비활성) 확인.

### 진실 검증 2 — 앱 실행 & 패키징 (10:44–10:52)

- [앱기동] npx electron . 기동 성공(ARN148 안정, 오류 로그 0), 메인 프로세스 ctx=lib in dist, renderer 로딩 완료.
- [패키징] npm run dist:mac → release/에 DMG 204MB + zip 204MB + blockmap 산출. codesign 미적용( AdHoc ).
- [홈페이지] site/index.html 구성: hero/404 방지용 안전링크, release/manifest.json 발견시 dl 링크 교체 스크립트,
  플랫폼표, 보안 안내. python3 -m http.server 8788로 서빙 확인(200 OK).

### 배포 — Tailscale Funnel 공개 (10:55–11:15)

- [서버] honri@100.113.209.56 (ubuntu.tail543772.ts.net) 접속 확인. 기존: pm2 `systems-download`(127.0.0.1:8444) +
  funnel `/`→8443, `/Systems`→8444 운영 중 — 무변경 보존.
- [신규] `pm2 serve /home/honri/pixelfloor/site 8445 --name pixelfloor-download` 추가 + pm2 save(재부팅 자동시작).
- [funnel] `tailscale funnel --bg --https=443 --set-path=/pixel http://127.0.0.1:8445` 추가 →
  https://ubuntu.tail543772.ts.net/pixel/ (기존 /Systems와 동시 운영 확인).
- [산출물] DMG 204,229,294B + ZIP 204,272,502B rsync 업로드(~4.4MB/s). HEAD 200(application/octet-stream)·
  전송 확인. Windows/Intel x64 빌드는 미존재 → manifest에서 제외 + 페이지 행 자동 숨김 처리.
- [검증] /pixel/=200, /Systems/=200(기존 영향 없음), manifest 200, DMG 링크 200.

---

## 2026-10-08

### HiveDesk 0.2.0 - 모의거래/실거래/자동매매/토스/바이낸스 지원

- [네이밍] 앱명 확정: **HiveDesk(하이브데스크)**. package.json(name/productName/appId com.hivedesk.app),
  index.html title+로고에 전면 적용. v0.1.0 -> v0.2.0.
- [브로커 레이어] src/brokers/: types(Broker 인터페이스: quote/balances/marketOrder),
  http(node:https JSON 헬퍼), paper(즉시체결 모의), binance(HMAC-SHA260 서명 REST, 테스트넷 기본),
  toss(OAuth2 client_credentials 토큰 캐시, 주문/잔고). old/ 엔진 파이썬 구현을 참조해 TS 포팅.
- [키 보관함] src/vault.ts: Electron safeStorage(OS 키체인) 기반 암호화. 키 없는 환경은 xor 마커로 구분.
- [실행 엔진] src/executor.ts: 게이트 순서 = HOLD->확신도(60%)->모의 체결/현금 체크->실거래
  (전역 킬스위치 + 전략 live_unlocked + approval_mode 중 이중잠금) -> 브로커 잔고 재확인 -> 주문.
  require() 제거로 CommonJS 번들 안전화. approveOrder/rejectOrder 승인 큐 API.
- [스케줄러] src/scheduler.ts: 자동 전략별 타이머(최소 5분), tick = 시세 파이프라인 -> executor,
  runNow(수동 즉시 실행) 지원.
- [메인 IPC] electron/main.ts 확장: strategy:list/create/update/delete, scheduler:status/reload/runNow,
  orders:pending, order:approve/reject, broker:status/quote/balances, vault:save/clear,
  killswitch:get/set, meeting:run이 이제 전략(strategyId)을 받아 실행.
- [preload] 전 API 브릿지 노출. renderer app.ts 타입 반영.
- [UI] 자동매매 탭 신설: 킬스위치 토글, 브로커 키 저장(안전 저장), 잔고 조회 테스트,
  전략 목록(자동/주기/승인/실거래 잠금 표시, 지금 실행/잠금해제/삭제), 전략 추가 폼,
  주문 승인 큐(승인/거부) + CSS .form-grid/.switch/테이블 스타일.
- [이모지 제거(rule)] 이모지 사용금지 반영: 오피스/자동매매/포트폴리오/설정 탭, 회의 시작 버튼,
  차트 제목/소스, run-meta, toast, Claude 온보딩 문구, pipeline 발언 모두 텍스트로 치환.
  폰트 아이콘 없이 자체 픽셀 아이콘(renderer/ts/icons.ts 12x12 그리드)만 사용.
- [진실 검증] tsc --noEmit exit 0 (PlanOrder.symbol 부재 버그 수정 후),
  npm run build exit 0 (esbuild 25.7kb 번들+dist 복사).
  npx electron . 스모크 테스트 12초: 프로세스 RUNNING, 오류 로그 0,
  user-data-dir=/Application Support/HiveDesk 정상.
- [아이콘 연결] icons.ts를 UI에 실제 마운트: 탭 버튼 4종(오피스/bolt/포트폴리오/gear),
  재생/일시정지 버튼상태 전환(makeIconCanvas). 남은 글리프(▶/◀)도 HTML 엔티티 로 치환.
  재검증: tsc 0 / build 0 / electron 스모크 ALIVE 무로그.

### Apache 재배포 — HiveDesk 0.2.0 (09:18–09:40)

- [패키징-mac] npm run dist:mac exit 0 → HiveDesk-0.2.0-arm64.dmg 204,250,616B +
  HiveDesk-0.2.0-arm64-mac.zip 204,284,899B (AdHoc 서명).
- [사이트] site/index.html HiveDesk 브랜딩 전면 갱신: title/logo/hero/카드6종,
  실거래(바이낸스·토스) 안내 카드 신설, 이모지 제거, 다운로드 표 v0.2.0 4행
  (mac dmg/zip + win exe/zip), manifest 4키.
- [패키징-win] npm run dist:win exit 0 (wine/wheels 자동 다운로드, signtool 미서명 스킵) →
  HiveDesk Setup 0.2.0.exe 165,806,689B (NSIS) + HiveDesk-0.2.0-arm64-win.zip 226,246,819B.
  주의: 크로스컴파일 산출물은 arm64 — x64 인텔/AMD 윈도우는 별도 빌드 필요.
- [업로드] DMG+ZIP(~408MB) 후 exe+zip(~392MB) rsync 완료.
  pm2(pixelfloor-download:8445)와 funnel /pixel 경로 무변경, systems-download 무변경.
- [검증] /pixel/ 200 + title=HiveDesk, 4개 파일명 모두 페이지 노출,
  manifest 200, DMG/EXE HEAD 200(application/octet-stream), ZIP range-GET 200,
  /Systems/ 200 (기존 영향 없음).

[한계] 미서명 빌드(AdHoc/signtool 스킵) — macOS 최초 실행 우클릭→열기,
  Windows SmartScreen 추가정보→실행 안내는 사이트에 명시됨.
  Windows x64(인텔/AMD) 빌드와 실호출(브로커 키 필요)은 미수행.

### 오피스 UI 전면 개편 — 탑다운 평면도 (09:50–10:15)

- [트리거] 사용자 스크린샷(munder-difflin 스타일) 대비 현재 UI가 과거 측면 스프라이트
  + 어두운 테마라 상이 확인. 사용자 선택: 탑다운 평면도 + 밝은 크림 테마로 전면 교체.
- [스프라이트] icons.ts에 8x8 타일(floor/wall/desk/monitor/plant/rug/window/kitchen/fridge)
  + 8x10 캐릭터 4방향 템플릿(down/up/left/right) 추가 — 전부 직접 픽셀 그리드,
  외부 이미지 0. 에이전트별 skin(머리색/옷색) 매핑(AGENT_SKINS).
- [렌더러] officeFloor.ts 신설: 26x19 타일 맵(벽/책상/화분/라운드러그/주방/창),
  60fps 게임 루프(step+draw), 캐릭터 walk-to-target(리서처/총괄 → 러그 중앙, 타인 → 자리),
  발언 캔버스 말풍선(둥근 모서리 흰색 박스, 42자 절단).
- [레이아웃] index.html 오피스 탭 재구성: 3룸 측면 스테이지 → 평면도 캔버스 +
  우측 COMMAND CENTER(최종 판정) + 하단 에이전트 상태카드 스트립(waiting/working/talking).
  app.ts에 AGENT_KEYS/AGENT_NAMES/AGENT_STATES + buildStatusCards/refreshStatusCards.
- [테마] CSS 크림/베이지 팔레트로 변경(--bg #efe9db 등), 네온 그림자 제거,
  픽셀 캔버스 image-rendering: pixelated.
- [검증] tsc --noEmit 0 (중복 선언 TileId/TILE_COLORS/TILES 초안 블록 삭제 후),
  npm run build 0, electron 스모크 12초 ALIVE 무로그.

[한계] 리서처 라운드테이블 이동 좌표/발언 상태(talking)는 규칙 기반 —
  Claude 실발언 길이에 따른 bubble 폭 자동 계산은 canvas measureText로 처리되나
  매우 긴 발언은 42자 절단. difflin의 터미널 로그/툴바/메모리 카드는 미이식.

### UI 다듬기 — 렌더링 결함 수정 (10:20–10:40)

- [도구] main.ts에 HIVEDESK_SHOT/TAB/RUN/DEBUG 환경변수 헬퍼 추가:
  로드 후 지정 탭 클릭·회의 실행·capturePage 저장. 4개 탭 전체를 자동 스크린샷 검증 가능.
- [버그1-핵심] 하단 상태카드가 "빈 알약"으로 그려지던 원인 = flex-shrink:
  #tab-office(flex column, min-height:0)에서 stage 캔버스가 커지면 status-strip이
  15px까지 눌려 카드 하단이 클립됨. `#tab-office > * { flex-shrink: 0 }` 해결.
  (DOM/computed-style은 정상이었다 — 시각 클립만 문제였던 케이스)
- [버그2] 오피스 캔버스 세로 잘림 = stage 그리드 내 height:auto →
  #floor-wrap aspect-ratio 26/19 + max-height 460 + canvas object-fit contain.
- [버그3] 캐릭터가 책상 위에 겹쳐 서 있던 SEATS 좌표 재설계:
  MAP 재작성(책상 5개 명확 분리), 좌석은 책상 한 칸 아래, 리서처 3인은 러그.
- [버그4] 이전 발언자 "발언 중" 상태 잔존(4명 동시 발언 표시) →
  renderStep에서 전원 waiting 리셋 후 현 발언자만 talking.
- [버그5] 재생 버튼 최초 아이콘 공백 → DOMContentLoaded에서 syncPlayBtn() 1회 호출.
- [정리] 상태카드 라벨 한국어(waiting=대기/talking=발언 중),
  결정 기록 "엔진" 헤더 → 실제 표시값(회의 #N)과 일치시켜 "회의"로 변경,
  카드 최소높이/아이콘 20px/nowrap, 차트 높이 260→220, console-body min-height 60.
- [검증] 오피스(대기/발언중 상태카드+평면도), 자동매매(폼·테이블), 포트폴리오(카드·테이블),
  설정(Claude 안내) 4탭 스크린샷 확인. HIVEDESK_RUN으로 실제 회의 실행 캡처:
  4/10 진행, 로그 행 하이라이트, 진행바, 캔들차트, 상태카드 단일 발언자 확인.
  tsc 0 / build 0.

### 구버전 앱 문제 + 오피스 크기 (10:45–11:00)

- [원인] 사용자 실행 앱이 구 UI — release/mac-arm64/HiveDesk.app이 오피스 개편 전 빌드로
  남아 있었음 (npx electron . 실행은 최신). 개편 전 패키징 산출물.
- [조치] release/mac-arm64 디렉토리 삭제. v0.2.1로 버전업 + dist:mac 재실행 →
  HiveDesk-0.2.1-arm64.dmg/zip 생성, 서버 업로드, manifest/사이트 표 갱신.
- [크기] 오피스 캔버스가 max-height 460px 제한으로 작게 중앙 정렬되던 것 →
  width 100% + max-height 62vh + object-fit contain으로 화면 폭 전체 확대. 스크린샷 확인.
- [검증] DMG HEAD 200, manifest 0.2.1, 사이트 표 v0.2.1 노출. tsc 0 / build 0.
- [안내] 로컬 실행은 `cd app && npx electron .` (최신), 다운로드 앱은 0.2.1부터 탑다운 UI.

### 말풍선 픽셀화 수정 (11:00–11:20)

- [원인] 말풍선을 오피스 캔버스(416x304, image-rendering:pixelated)에 직접 그려
  확대 시 글자도 함께 픽셀화되어 판독 어려움.
- [수정] 말풍선을 DOM 오버레이(#bubble-layer)로 이전: 캐릭터 타일 좌표를 %로 변환해
  absolute 배치(transform translate(-50%,-100%) + 꼬리 화살표), 폰트 12px 고정 →
  어떤 확대 배율에서도 선명. 42→60자 절단, max-width 30% ellipsis.
- [부가] renderStep에서 이전 발언자 말풍선 미제거로 동시 2개 표시되던 것 수정
  (현 발언자 외 전원 speak(null)).
- [캡처도구] HIVEDESK_PAUSE(재생 일시정지)+SCROLL_TOP(캡처 직전 스크롤) 추가 —
  renderStep의 scrollIntoView가 계속 탭을 아래로 당기는 문제 회피.
- [배포] v0.2.2 재패키징(dist:mac exit 0) + 업로드 + manifest/사이트 갱신. HEAD 200 확인.
- [검증] 회의 실행 캡처에서 선명한 한글 말풍선 1개만 표시, 캐릭터 상단 앵커 정상.
  tsc 0 / build 0.

[미해결] 실거래는 키등록+킬스위치+전략잠금해제가 모두 필요하므로 기본값 OFF로 안전.
  Windows 빌드는 다음 세션(dist:win) 예정.

## v0.2.3 — 오피스 실사화 리뉴얼 + 가이드/Discord (10/8)

- [오피스] officeFloor.ts 전면 재작성. 실제 회사 배치: 회의실(화이트보드+타원 테이블+의자 8),
  경영실(집행자 책상+게스트 의자+라운드 테이블), 애널리스트/리서치 워크스테이션 각 4식
  (모니터·키보드·마우스·머그·서류·파티션), 트레이딩 코너(듀얼모니터 2식),
  라운지(러그+소파+커피테이블+TV), 리셉션(카운터+모니터+벨+도어매트), 키친(싱크대 카운터+
  커피머신+냉장고+정수기+원탁), 복사기, 책장, 화분, 바닥 구역 라벨(회의실/경영실/ANALYST/
  RESEARCH/TRADING/LOUNGE/KITCHEN/RECEPTION).
- [동선] 배회 주기 단축(5–15s), 휴게 3–8s, 리서치 발언 시 회의실 집합 유지. 이동속도 1.5배.
- [검증] tsc --noEmit 0, bundle:renderer 0. 캡처 2건: 대기화면(좌석 캐릭터 렌더 확인) +
  회의 실행(DOM 말풍선 선명 1개, 판정 BUY 82%, 로그 재생 정상).
- [사이트] guide.html 신규(설치/Claude 연동/데모/자동매매·키 설정/FAQ) + index에
  Discord 버튼 3곳(invite/FGqZ7jJpFD) + 가이드 링크 + 오피스 소개 문구 갱신.
- [배포] v0.2.3 dist:mac exit 0 (DMG+ZIP 204MB×2) 업로드, manifest/사이트 0.2.3 갱신.
  잘못 업로드된 site/site 중첩경로 정리. home/guide/dmg/zip 모두 200.

## 홈페이지 리디자인 v2 (10/8)

- [사이트] site/index.html 전면 리디자인: 앰비언트 그라디언트 오브+그리드 배경,
  히어로 그라디언트 타이틀(shine 애니메이션), 픽셀 에이전트 걷기 캔버스 스트립(rAF,
  다리 스윙+바운스), 판정 무한 마퀴 티커, 실앱 스크린샷 2종(office.png/meeting.png,
  hover 리프트), 파이프라인 5스텝 카드, 기능 카드 hover 애니메이션, FAQ 아코디언,
  Discord 그라디언트 배너(펄스 버튼), 다운로드 테이블 hover.
- [접근성] 진입 애니메이션은 html.anim(JS 동작시)에만 적용하는 점진적 향상,
  IntersectionObserver 미지원 시 .rv 전부 표시, prefers-reduced-motion 존중.
- [검증] Electron 실시간 캡처(스크롤 리빌 트리거) 로컬+프로덕션 모두 확인:
  히어로/에이전트 스트립(프레임마다 위치 변화=애니메이션 동작)/티커/스크린샷 2장/
  FAQ/Discord 배너/다운로드 표(manifest로 받기 링크 교체)/푸터.
- [배포] index.html + assets/ 업로드. home/office.png/meeting.png 모두 200.
  guide.html 무변경.

## 모바일 대응 (10/8)

- [사이트] 모바일 반응형 추가: ≤760px에서 헤더 축소+가이드 버튼 숨김, CTA 세로 스택(전체폭),
  스크린샷 1열, 섹션 패딩/타이포 축소, Discord 배너 축소. ≤380px 추가 축소.
- [구조] 다운로드 4열 표를 .dl-scroll 래퍼로 감싸 가로 스크롤, 픽셀 캔버스 스트립
  width:100%(max 520px) 반응형. (기존엔 모바일 대응 전무 — 헤더 오버플로·캔버스 520px 고정·표 잘림)
- [검증] Electron 모바일 뷰포트 390×844 오프스크린 캡처: 히어로/파이프라인/다운로드/프로덕션 모두 정상.
  라이브 home 200, 반응형 CSS 서빙 확인.
- [추가검증] 커피 브레이크 렌더 확률 강제 캡처로 확인(픽셀 컵+김 정상) 후 0.22 원복.
  원복 후 tsc --noEmit exit 0, bundle 재생성 및 dist 사본 동기화.

## 직원 이름표 + 겹침 방지 + 스크롤 픽스 + 홈페이지 v5 (10/8)

- [오피스] 직원 이름표 추가(발밑 픽셀 태그): 차민·기술, 서아·뉴스, 도윤·센티, 지호·펀더,
  하윤·강세, 은우·약세, 수빈·총괄, 태오·트레이더, 세라·리스크, 미르·PM. 상태 카드/로그에도 이름 표기.
- [오피스] 에이전트 겹침 방지 separation pass(최소 간격 0.75타일, 프레임마다 밀어내기).
  대화 확률 23→34%, 대화 시간 9~15초로 연장. 커피 18%.
- [버그] 회의 진행 시 로그 scrollIntoView가 오피스 탭까지 스크롤시켜 화면이 갑자기 내려가던 문제 수정
  — #console-body만 getBoundingClientRect 기반으로 스크롤.
- [freebuff CLI 연동 검토] 비대화형(--print) 모드 부재로 현재 앱 엔진 연동 불가. 바이너리 파싱 확인:
  freebuff 모드는 프롬프트 인자 없음(대화형 전용). 키체인 프롬프트는 CLI가 토큰을 키체인에서
  읽으려 해서 발생(macOS 권한 확인) — '항상 허용' 또는 거부(파일 폴백) 모두 무방.
- [홈페이지] 기능 카드 아이콘을 앱 아이콘 스타일 헥사곤 배지(주황 그라디언트+흰 픽셀 글리프, clip-path)로 변경.
  캐러셀 스텝 내용 보강(각 단계 2문장). FAQ 중앙 정렬(900px, margin auto).
- [검증] tsc exit 0, bundle 성공, 앱 캡처(이름표·대화 점·겹침 없음 확인), 사이트 로컬 캡처
  (헥사곤 배지·배지 위치·FAQ 중앙·캐러셀 확인), 라이브 200 + 헥사곤 CSS 서빙 확인.
- [추가검증] 실제 회의 실행 16초 시점 캡처: 로그 진행 중에도 오피스 화면 제자리 유지(스크롤 픽스 동작 확인),
  이름표 10명 전원 표시, 말풍선 정상, 겹침 없음.

## 앱 아이콘 전면 재디자인 (2026-10-09)
- 기존: Electron 기본 아이콘(은하계)이 앱에 반영돼있고, 홈페이지는 헥사곤 벌 — 불일치 원인 발견.
- 사용자 요청: "완전 새 디자인, 기존 다 지우고" → v2 5종 제작 후 **1번 벌집+에이전트** 선정.
- 확정 아이콘: 다크 네이비 배경 + 주황 헥사 7개 벌집 + 중앙 강조 에이전트 (벌집 = HiveDesk 팀, 빛나는 중앙 = 발언 중 에이전트).
- 적용: app/build/icon.png 교체 + iconutil로 build/icon.icns 생성 (electron-builder 반영용).
- 홈페이지: site/assets/icon.png 교체(파비콘/로고/OG이미지), 카드 아이콘을 다크 라운드+주황 글리프 스타일로 통일.
- 검증: 라이브(8794/8795) 200 + 아이콘 md5 일치 + 신규 CSS 서빙 확인, 캡처로 로고/카드 확인.
- 남은 작업: 다음 `dist:mac` 패키징 시 앱 독 아이콘이 새로 바뀜.

## 라이브 홈페이지 아이콘 갱신 (2026-10-09)
- [원인] 라이브 서빙 경로는 ubuntu.tail543772.ts.net/hivedesk → pm2 serve /home/honri/pixelfloor/site (로컬 site/와는 별개 파일).
- [조치] 신규 index.html(83d7923f…) + 벌집 아이콘(7f4d0e15…) rsync 후 서버측 cp 반영.
- [검증] 라이브 /hivedesk/ 200, title 확인, 신규 CSS(border-radius:11px) 서빙 1, 아이콘 md5 로컬 일치.
- [비고] /pixel/ funnel 경로는 현재 존재하지 않음(404) — 접속 주소는 /hivedesk/. 브라우저 캐시 시 강력새로고침 필요.

## 단체회의 애니메이션 + 윈도우 지원 (2026-10-09)
- [앱] 회의 단체 표현: beginMeetingPhase() — 분석/리서치 턴 중엔 리서치진 7명이 회의실 탈 의자 좌표(GROUP_SPOTS)로 모임,
  트레이더/리스크/PM 턴에는 흩어짐. trader/risk_manager는 PM 턴 이후 경영실로 이동해 보고(reportHold 6.5s).
- [말풍선] max-width 30% → 46vw로 완화 — 긴 발언 잘림 개선.
- [전체화면] floor-wrap width min(100%, 92vh*4/3), canvas object-fit fill → 좌우 여백 축소.
- [검증] tsc --noEmit exit 0, esbuild 번들 성공, 회의 9초 캡처에서 분석가 4+리서치 3 회의실 집합 + 말풍선 전문 표시 확인.
- [윈도우] electron-builder --win --x64 → HiveDesk Setup 0.2.3.exe(160MB) + HiveDesk-0.2.3-win.zip(221MB) 업로드.
  사이드이펙트: better-sqlite3이 x64로 재빌드됨 → electron-rebuild -f -w 복구(darwin arm64).
- [사이트] 앱 스크린샷 최신화(office.png 92KB, meeting.png 112KB — 단체회의 화면), 윈도우 다운로드 행 0.2.0→0.2.3 x64 갱신,
  manifest.json에 win/win-zip 추가. 라이브 검증: /hivedesk/ 200, exe HEAD 200, manifest 200(4키), office/meeting 200.
- [사이트 추가수정] 다운로드표: macOS 2행의 차이(dmg=설치용 권장 / zip=바로실행) 명시, 받기 버튼 4개 모두 primary로 통일. 라이브 반영 검증(버튼 4개 primary, md5 일치).

## v0.2.4 — 자동 업데이트 지원 (2026-10-10, 전원 꺼짐 중단 후 재개)

- [선결제] 중간 컴퓨터 종료로 세션 중단. build-tmp/app이 10/10 10:43경 electron-updater
  설치(electron-updater 6.8.9 成为lock) + main.ts에 startAutoUpdate() 작성까지 진행된 상태였음.
  재개 시 typecheck/build/스모크 재검 후 남은 작업 완수.
- [메인] electron/main.ts startAutoUpdate(): feed = generic provider
  https://ubuntu.tail543772.ts.net/hivedesk/release (latest.yml). autoDownload+autoInstallOnAppQuit,
  30초 후 1회 + 6시간 간격 checkForUpdates. update:available/downloaded → renderer update:status 전송.
  개발 모드(app.isPackaged=false)에서는 체크 생략.
- [프리로드] onUpdateStatus(cb) 브릿지 노출.
- [renderer] app.ts Api 타입에 onUpdateStatus 추가. available → “새 버전 다운로드 중...”,
  downloaded → “앱 재시작 시 자동 설치” toast로 알림.
- [빌드] electron-builder.yml 내 !node_modules 제외 패턴이 양쿠시해지지 않아 YAML 태그 오류
  (tag suffix cannot contain flow indicator characters) → 따옴표로 감싸 해결. 이후 재시도에서 DMG/ZIP 정상.
- [배포] dist:mac exit 0 → HiveDesk-0.2.4-arm64.dmg 204,600,847B + zip 204,586,897B + blockmap.
  latest.yml/latest-mac.yml 수동 생성(zip sha512, size, releaseDate) — electron-builder publish 미사용.generic 피드 방식.
  rsync로 release/ 아래 dmg+zip+yml+blockmap 업로드(약 409MB, ~5.3MB/s).
- [검증] latest.yml 200(text/yaml, 0.2.4 내용 확인), DMG 200, ZIP 200.
  manifest.json 서버/로컬 동시에 0.2.4로 갱신(mac-arm64, mac-arm64-zip). tsc --noEmit 0, npm run build 0, electron 스모크 ALIVE 무로그.
- [안내] 자동 설치는 앱 종료 시 수행됨(최소 2회 실행 후 1회). macOS 미서명 빌드 특성상 우클릭 → 열기 안내는 사이트 기존 문구 유지.
