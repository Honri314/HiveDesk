# Pixel Trading Floor

TradingAgents(멀티 에이전트 트레이딩 파이프라인) + munder-difflin(Claude CLI 구독 계정 하네스)을 합친
**Claude 계정 로그인 기반 데스크톱 모의거래 데스크**입니다.

- macOS / Windows (Electron) · UI/발화 전부 한국어
- Claude 구독 계정 연동: API 키 입력 없음 — 로컬 `claude` CLI의 로그인 세션을 사용
- 미연동/오프라인이면 **데모(룰베이스) 모드**로 동일 파이프라인 시연
- 모의거래 전용 (실제 주문 없음)

```bash
# 개발 실행
npm install
npm run build
npm start

# 타입체크
npm run typecheck

# 패키징
npm run dist:mac   # release/ 아래 dmg+zip (arm64/macOS)
npm run dist:win   # ⚠ 사전 요구: 네이티브 모듈의 win prebuilt가 필요하므로
                   #   macOS에서 --win 크로스빌드 시 better-sqlite3는
                   #   prebuilds/win32-x64.node를 사용하도록 asarUnpack 유지되어 있지만
                   #   확실한 방법은 Windows 머신에서 npm i 후 npm run build && npm run dist:win
```

## 구현 위치

```
app/
├─ electron/      main.ts (윈도·IPC·DB·파이프라인 호출), preload.ts (contextBridge)
├─ src/           types / store(SQLite) / market(Yahoo·Binance·지표) / claude(CLI 감지·SDK 러너)
│                 pipeline(애널리스트4→토론→트레이더→리스크→PM, 데모 페르소나)
├─ renderer/      픽셀 오피스 3방 + 회의 재생 + 포트폴리오 + 연동 설정
└─ release/       electron-builder 산출물 (dmg/zip/exe)
site/             다운로드 홈페이지 (release/manifest.json 있으면 파일 링크 자동 교체)
```

## Claude 연동 흐름

1. 앱 우측 상단 상태 확인 (⚙ 연동 탭)
2. CLI 없음 → `npm i -g @anthropic-ai/claude-code` 안내
3. 터미널에서 `claude` 실행 → 브라우저에서 계정 로그인 (구독 사용)
4. 앱을 다시 열면 ✅ — 이후 회의부터 실제 Claude 발언 생성

> 규칙(rule.md)과 빌드 기록(buildlog.md)은 저장소 루트에 유지됩니다.
