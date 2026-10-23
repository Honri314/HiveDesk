# HiveDesk — 프로젝트 규칙 (rule.md)

> 이 문서는 프로젝트의 **설계 규칙과 원칙**을 기록한다. 코드 변경 시 이 규칙과 충돌하면
> 규칙을 먼저 갱신하고 커밋/빌드 로그에 이유를 남긴다. 빌드 과정 기록은 `buildlog.md` 참고.
> (구 이름: Pixel Trading Floor → **HiveDesk**, 2026-10-07 변경)

## 1. 프로젝트 정의

**TradingAgents**(github.com/TauricResearch/TradingAgents)의 멀티 에이전트 트레이딩
파이프라인과 **munder-difflin**(github.com/HarnessMD/munder-difflin)의 "구독 계정으로
구동되는 에이전트 오피스" 개념을 결합한, **Claude 계정 로그인 기반 데스크톱 트레이딩 데스크**.

- **플랫폼**: macOS / Windows 데스크톱 앱 (Electron) + 다운로드 홈페이지
- **LLM 연동**: Claude **계정 로그인(구독)** — API 키가 기본이 아니다.
- **브로커**: 모의거래(기본) + **바이낸스 현물** + **토스증권 오픈API** (실거래, 이중 잠금 필요)
- **자동 매매**: 전략(Strategy) 단위 자동 실행 스케줄러
- **언어**: UI/에이전트 발화 모두 한국어 기본.

## 2. 아키텍처 규칙

1. **단일 Electron 앱**: 메인 프로세스(electron/)·데이터(src/)·렌더러(renderer/). 별도 백엔드 없음.
2. **에이전트는 Claude Agent SDK로만 구동**. 렌더러에서 직접 API 호출 금지.
   자격 증명·네트워크·DB·브로커 주문은 메인 프로세스 전용.
3. **계정 연동 규칙(Claude)**: 앱은 CLI 존재/로그인 상태만 감지, 로그인은 공식 CLI 흐름.
   앱이 비밀번호/토큰을 수집·저장하지 않는다.
4. **연동 없으면 데모 모드**: 규칙 기반 페르소나로 파이프라인 시연. API 키 입력창은
   브로커 연동에만 존재(Claude에는 없음).
5. **파이프라인은 TradingAgents 표준**: 애널리스트4 → 강세/약세 토론 → 리서치 매니저 →
   트레이더 → 리스크 → PM. 순서·역할 축소 금지.
6. **모든 회의는 턴 목록으로 기록** — 픽셀 오피스 재생과 로그의 유일한 데이터 소스.
7. **마켓데이터**: 공개 엔드포인트(Yahoo, Binance public)만. 실패 시 합성 데이터 강등 표시.
8. **DB는 better-sqlite3(로컬)**: strategies / meetings / turns / decisions / orders /
   cash / settings / vault. 원격 DB 금지.

## 3. 실거래·자동매매 안전 규칙 (v0.2 신설)

- **이중 잠금**: 실거래는 ①전역 킬스위치(설정) AND ②전략별 live_unlocked 가 모두 켜져야만
  브로커 주문이 나간다. 하나라도 꺼져 있으면 주문은 모의거래로 강등되거나 보류된다.
- **승인 방식 기본값 = 수동**: 실거래 주문은 기본 "승인 대기(pending)"로 큐에 쌓이고
  사용자가 승인해야 브로커로 나간다. 자동 실행으로 바꾸는 것은 전략별 명시적 선택.
- **키 보관**: 바이낸스 API 키/시크릿, 토스 client_id/secret/account_seq는 Electron
  safeStorage(OS 키체인)로 암호화해 로컬 DB에 저장. 평문 저장·원격 전송 금지.
- **주문 한도**: 전략당 1회 주문 금액 ≤ 현금(모의) 또는 잔고(실거래)의 20%.
  확신도 60% 미만이면 자동 모드에서도 홀드 처리.
- **손절/익절**: 전략에 stop_loss/take_profit % 필수. 스케줄러 사이클마다 평가.
- **모의→실거래 전환**: 전략은 항상 paper로 생성되며, real 전환은 UI 경고 confirm 필요.
- **테스트넷**: 바이낸스는 testnet 토글 기본 ON. 토스는 시장가 주문만 지원(정수 수량).

## 4. UI 규칙

- **이모지 사용 금지** — UI·문서·로그·커밋 메시지에 유니코드 이모지를 쓰지 않는다.
  아이콘이 필요하면 `renderer/ts/icons.ts`의 **자체 제작 12×12 픽셀 아이콘**을 쓰거나
  직접 그린 인라인 SVG를 사용한다 (v0.2 신설).
- 픽셀 오피스 3방(분석팀/라운드테이블/트레이딩 본부) 고정. 12×12 스프라이트.
- 브로커/키 입력은 설정 탭 한곳에만. 주문 상태(대기/체결/거부/기각)는 포트폴리오 탭에서 표시.
- 실거래 요소는 시각적으로 구분(빨강 배지 "REAL").

## 5. 빌드·배포 규칙

- `npm run build` → tsc + esbuild 후 `npm run typecheck` 0 에러.
- 패키징 electron-builder: mac(dmg·zip)/win(nsis·zip). 네이티브 모듈·SDK asarUnpack.
- 다운로드 홈페이지(site/)는 Tailscale Funnel `/pixel` 경로로 서빙되며, 산출물 교체 시
  release/manifest.json 갱신이 원칙.

## 6. 확인된 환경 규칙

- **better-sqlite3 v13 prebuild 세그폴트** → v12.4.1 고정.
- **Electron 44+ require/ESM 충돌** → Electron 33.x 고정. 네이티브 모듈은
  `npm rebuild better-sqlite3 --runtime=electron --target=33.4.11 --dist-url=https://electronjs.org/headers` 필요.
- **Claude Agent SDK는 ESM-only** → 지연 동적 import 사용.

## 7. 문서 규칙

- rule.md / buildlog.md는 항상 저장소 루트에 유지. 규칙 위반 수정 시:
  rule.md 갱신 → buildlog.md 사유 기록 → 코드 수정 순서.
