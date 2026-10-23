/* Renderer logic. Talks to the main process only via window.api (preload). */

interface Turn { key: string; agent: string; mood: string; ts: string; content: string; }
interface ClaudeStatusShape { cli: boolean; loggedIn: boolean; email: string | null; hint: string; }
interface Snapshot {
  symbol: string; name: string; source: string; last: number;
  ma10: number; ma30: number; rsi14: number; macdLine: number; macdSignal: number;
  candles: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
}
interface RunOutcome {
  meetingId: number; turns: Turn[]; action: "BUY" | "SELL" | "HOLD"; confidence: number;
  reasoning: string; engine: string; degraded: string | null;
  order: { quantity: number; price: number; status: string; reason: string } | null;
}
interface RunOutcomePre {
  meetingId: number; turns: Turn[]; action: string; confidence: number;
}
interface Window {
  api: {
      claudeStatus(): Promise<ClaudeStatusShape>;
      marketResolve(input: string): Promise<{ ticker: string; name: string }>;
      marketSnapshot(input: string): Promise<Snapshot>;
      meetingRun(input: string, strategyId?: number): Promise<RunOutcome>;
      meetingGet(id: number): Promise<unknown>;
      meetingList(): Promise<unknown[]>;
      portfolioGet(): Promise<{
        cash: number; positions: Record<string, { qty: number; avg: number }>;
        orders: Record<string, unknown>[]; decisions: Record<string, unknown>[];
      }>;
      settingsGet(key: string): Promise<string>;
      settingsSet(key: string, value: string): Promise<void>;
      /* strategies & auto trading */
      strategyList(): Promise<StrategyShape[]>;
      strategyCreate(data: Record<string, unknown>): Promise<unknown>;
      strategyUpdate(id: number, fields: Record<string, unknown>): Promise<unknown>;
      strategyDelete(id: number): Promise<boolean>;
      schedulerStatus(): Promise<Array<{ id: number; nextRunAt: string }>>;
      schedulerReload(): Promise<unknown>;
      schedulerRunNow(id: number): Promise<{ status: string; reason: string; meetingId: number | null }>;
      ordersPending(): Promise<Record<string, unknown>[]>;
      orderApprove(orderId: number): Promise<{ status: string; reason: string }>;
      orderReject(orderId: number, reason?: string): Promise<boolean>;
      /* brokers & vault */
      brokerStatus(): Promise<{ binance: boolean; toss: boolean; killSwitch: boolean; testnet: boolean }>;
      brokerQuote(brokerId: string, symbol: string): Promise<number>;
      brokerBalances(brokerId: string): Promise<Array<{ asset: string; free: number; locked: number }>>;
      vaultSave(key: string, value: string): Promise<boolean>;
      vaultClear(key: string): Promise<boolean>;
      killswitchGet(): Promise<boolean>;
      killswitchSet(on: boolean): Promise<boolean>;
  };
}
interface StrategyShape {
  id: number; name: string; symbol: string; market: string; mode: string;
  auto: number; interval_min: number; budget: number;
  stop_loss_pct: number; take_profit_pct: number;
  approval_mode: string; live_unlocked: number; active: number; created_at: string;
}
interface WindowWithApi { api: Window["api"] }
const window_ = window as unknown as WindowWithApi;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

/* ------------------------------------------------------------------ */
/* Office floor rendering (top-down plan view)                          */
/* ------------------------------------------------------------------ */
let floor: OfficeFloor | null = null;

function ensureFloor(): OfficeFloor | null {
  const cv = document.querySelector("#office-canvas") as HTMLCanvasElement | null;
  if (!cv) return null;
  if (!floor) {
    const layer = document.querySelector("#bubble-layer") as HTMLDivElement | undefined;
    floor = new OfficeFloor(cv, layer);
  }
  return floor;
}

const AGENT_KEYS = [
  "market_analyst", "news_analyst", "sentiment_analyst", "fundamentals_analyst",
  "bull_researcher", "bear_researcher", "research_manager",
  "trader", "risk_manager", "portfolio_manager",
] as const;

const AGENT_NAMES: Record<string, string> = {
  market_analyst: "차민 · 기술", news_analyst: "서아 · 뉴스",
  sentiment_analyst: "도윤 · 센티", fundamentals_analyst: "지호 · 펀더",
  bull_researcher: "하윤 · 강세", bear_researcher: "은우 · 약세",
  research_manager: "수빈 · 총괄", trader: "태오 · 트레이더",
  risk_manager: "세라 · 리스크", portfolio_manager: "미르 · PM",
};

const AGENT_STATES: Record<string, string> = Object.fromEntries(
  AGENT_KEYS.map((k) => [k, "waiting"])
);

/* ------------------------------------------------------------------ */
/* Meeting playback                                                    */
/* ------------------------------------------------------------------ */
import { makeIconCanvas, mountIcons, bodyColorOf } from "./icons";
import { OfficeFloor } from "./officeFloor";
let turns: Turn[] = [];
let step = 0;
let autoPlay = false;
let autoTimer: ReturnType<typeof setTimeout> | null = null;

function renderStep(): void {
  const t = turns[step];
  if (!t) return;
  const f = ensureFloor();
  if (f) {
    for (const k of AGENT_KEYS) if (k !== t.key) f.speak(k, null); // clear previous bubble
    f.speak(t.key, t.content);
    // 회의 단계 표시: 분석/리서치/토론 단계에는 회의실에 단체로 모임, 트레이더-리스크-PM 단계에는 흨산
    const meetingPhase = !t.key.includes("trader") && t.key !== "risk_manager" && t.key !== "portfolio_manager";
    f.beginMeetingPhase(t.key, meetingPhase);
  }
  $$(".stcard").forEach((d) => d.classList.remove("speaking"));
  const card = $(`.stcard[data-agent="${t.key}"]`);
  if (card) card.classList.add("speaking");
  if (AGENT_STATES[t.key] !== undefined) {
    for (const k of AGENT_KEYS) AGENT_STATES[k] = "waiting";
    AGENT_STATES[t.key] = "talking";
    refreshStatusCards();
  }
  // log rows
  const body = $("#console-body");
  Array.from(body.children).forEach((row, i) => {
    row.className = `log-row ${i === step ? "on" : i < step ? "past" : ""}`;
  });
  const on = body.querySelector(".log-row.on") as HTMLElement | null;
  if (on) {
    // 로그 컨테이너만 스크롤 — scrollIntoView는 오피스 탭(상위 스크롤)까지 당겨서 화면이 튕긴다
    const bRect = body.getBoundingClientRect();
    const rRect = on.getBoundingClientRect();
    body.scrollTop += (rRect.top + rRect.height / 2) - (bRect.top + bRect.height / 2);
  }
  // progress
  const prog = $("#progress").children as unknown as HTMLElement[];
  Array.from(prog).forEach((sp, i) => { sp.className = i === step ? "on" : i < step ? "done" : ""; });
  $("#console-count").textContent = `${step + 1}/${turns.length}`;
}

function clearStage(): void {
  const f = ensureFloor();
  if (f) for (const key of AGENT_KEYS) f.speak(key, null);
  for (const key of AGENT_KEYS) AGENT_STATES[key] = "waiting";
  refreshStatusCards();
  const dp = $("#dp-action"); dp.textContent = "판정 대기 중"; dp.className = "";
  $("#dp-symbol").textContent = "—";
  $("#dp-order").textContent = "—";
  $("#dp-conf").textContent = "—";
  $("#dp-engine").textContent = "—";
}

function scheduleNext(): void {
  if (autoTimer) clearTimeout(autoTimer);
  if (!autoPlay) return;
  if (step >= turns.length - 1) { autoPlay = false; syncPlayBtn(); return; }
  const delay = Math.min(8000, 2200 + (turns[step]?.content.length ?? 30) * 16);
  autoTimer = setTimeout(() => { step++; renderStep(); scheduleNext(); }, delay);
}

function syncPlayBtn(): void {
  const btn = $("#play-btn") as HTMLElement;
  btn.innerHTML = "";
  btn.appendChild(makeIconCanvas(autoPlay ? "pause" : "play", 12, "#4f8cff"));
}

function stopPlayback(): void {
  autoPlay = false;
  if (autoTimer) clearTimeout(autoTimer);
  syncPlayBtn();
}

/* ------------------------------------------------------------------ */
/* Chart                                                              */
/* ------------------------------------------------------------------ */
function drawChart(snap: Snapshot): void {
  $("#chart-title").textContent = `가격 차트: ${snap.name} (${snap.symbol}) 최근 ${snap.candles.length}일`;
  $("#chart-src").textContent = snap.source === "synthetic" ? "[경고] 오프라인 합성 데이터" : `데이터: ${snap.source}`;
  const cv = $("#price-chart") as HTMLCanvasElement;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const W = cv.width, H = cv.height, PADL = 70, PADR = 10, PADT = 12, PADB = 22;
  ctx.clearRect(0, 0, W, H);
  const cs = snap.candles;
  if (!cs.length) return;
  const min = Math.min(...cs.map((c) => c.l)), max = Math.max(...cs.map((c) => c.h));
  const range = max - min || 1;
  const y = (p: number) => PADT + (H - PADT - PADB) * (1 - (p - min) / range);
  const n = cs.length;
  const cw = (W - PADL - PADR) / n;
  // grid
  ctx.strokeStyle = "#1c2330"; ctx.fillStyle = "#7a879b"; ctx.font = "10px monospace";
  for (let i = 0; i <= 4; i++) {
    const p = min + (range * i) / 4;
    ctx.beginPath(); ctx.moveTo(PADL, y(p)); ctx.lineTo(W - PADR, y(p)); ctx.stroke();
    ctx.fillText(compact(p), 6, y(p) + 3);
  }
  // candles
  cs.forEach((c, i) => {
    const x = PADL + i * cw + cw / 2;
    const upc = c.c >= c.o;
    ctx.strokeStyle = upc ? "#2ed573" : "#ff5a5f"; ctx.fillStyle = upc ? "#2ed573" : "#ff5a5f";
    ctx.beginPath(); ctx.moveTo(x, y(c.h)); ctx.lineTo(x, y(c.l)); ctx.stroke();
    const bw = Math.max(1, cw * 0.6);
    const top = y(Math.max(c.o, c.c)), bh = Math.max(1, y(Math.min(c.o, c.c)) - top);
    ctx.fillRect(x - bw / 2, top, bw, bh);
  });
  // MA lines
  const line = (window_n: number, color: string) => {
    ctx.strokeStyle = color; ctx.beginPath();
    cs.forEach((_, i) => {
      if (i < window_n - 1) return;
      const slice = cs.slice(i - window_n + 1, i + 1);
      const avg = slice.reduce((a, b) => a + b.c, 0) / window_n;
      const x = PADL + i * cw + cw / 2;
      if (i === window_n - 1) ctx.moveTo(x, y(avg)); else ctx.lineTo(x, y(avg));
    });
    ctx.stroke();
  };
  line(10, "#e8c84a"); line(30, "#4a9de8");
}
function compact(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`; if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`; return v.toFixed(0);
}

/* ------------------------------------------------------------------ */
/* Portfolio & settings                                               */
/* ------------------------------------------------------------------ */
const fmtKRW = (v: number) => v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });

async function refreshPortfolio(): Promise<void> {
  const p = await window_.api.portfolioGet();
  $("#pc-cash").textContent = fmtKRW(p.cash);
  const prices = await Promise.all(Object.keys(p.positions).map((sym) => window_.api.marketSnapshot(sym)));
  let eval_ = 0;
  const tbody = $("#pos-table tbody");
  tbody.innerHTML = "";
  const posList = Object.entries(p.positions);
  posList.forEach(([sym, pos], idx) => {
    const snap = prices[idx];
    const cur = snap?.last ?? pos.avg;
    const val = cur * pos.qty;
    eval_ += val;
    const pl = val - pos.avg * pos.qty;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(sym)}</td><td>${pos.qty}</td><td>${fmtKRW(pos.avg)}</td><td>${fmtKRW(cur)}</td>
      <td style="color:${pl >= 0 ? "var(--up)" : "var(--down)"}">${fmtKRW(pl)}</td>`;
    tbody.appendChild(tr);
  });
  if (!posList.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="dim">보유 포지션 없음 — 오피스 탭에서 첫 회의를 시작해 보세요.</td></tr>`;
  }
  $("#pc-value").textContent = fmtKRW(eval_);
  $("#pc-total").textContent = fmtKRW(p.cash + eval_);
  // orders
  const ob = $("#order-table tbody"); ob.innerHTML = "";
  p.orders.forEach((o: Record<string, unknown>) => {
    const tr = document.createElement("tr");
    const status = String(o.status);
    const side = String(o.side);
    tr.innerHTML = `<td class="dim">${new Date(String(o.created_at)).toLocaleString("ko-KR")}</td>
      <td>${escapeHtml(String(o.symbol))}</td>
      <td><span class="badge ${side === "BUY" ? "up" : "down"}">${side === "BUY" ? "매수" : "매도"}</span></td>
      <td>${Number(o.quantity) || "—"}</td><td>${fmtKRW(Number(o.price))}</td>
      <td><span class="badge ${status === "filled" ? "ok" : "skip"}">${status === "filled" ? "체결" : "없음"}</span></td>
      <td class="dim">${escapeHtml(String(o.reason ?? ""))}</td>`;
    ob.appendChild(tr);
  });
  if (!p.orders.length) ob.innerHTML = `<tr><td colspan="7" class="dim">주문 기록 없음</td></tr>`;
  // decisions
  const db = $("#decision-table tbody"); db.innerHTML = "";
  p.decisions.forEach((d: Record<string, unknown>) => {
    const action = String(d.action);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="dim">${new Date(String(d.created_at)).toLocaleString("ko-KR")}</td>
      <td>${escapeHtml(String(d.symbol))}</td>
      <td><span class="badge ${action === "BUY" ? "up" : action === "SELL" ? "down" : "flat"}">${action}</span></td>
      <td>${(Number(d.confidence) * 100).toFixed(0)}%</td>
      <td class="dim">${String(d.meeting_id) ? `회의 #${d.meeting_id}` : "—"}</td>`;
    db.appendChild(tr);
  });
  if (!p.decisions.length) db.innerHTML = `<tr><td colspan="5" class="dim">결정 기록 없음</td></tr>`;
}

async function refreshClaude(): Promise<void> {
  const s = await window_.api.claudeStatus();
  const dot = $("#cl-status .dot");
  dot.className = `dot ${s.cli && s.loggedIn ? "on" : "off"}`;
  $("#cl-status-text").textContent = s.cli && s.loggedIn ? `Claude 연동${s.email ? ` · ${s.email}` : ""}` : "미연동";
  const l1 = $("#cl-line1"), l2 = $("#cl-line2"), steps = $("#cl-steps");
  if (s.cli && s.loggedIn) {
    l1.textContent = s.email ? `${s.email} 계정으로 연동 완료` : "Claude 구독 계정 연동 완료";
    l2.textContent = "회의 시작 시 Claude가 애널리스트 발언을 생성합니다.";
    steps.textContent = "";
  } else {
    l1.textContent = "Claude 미연동 — 현재 데모(룰베이스) 엔진으로 회의합니다.";
    l2.textContent = s.cli ? "CLI는 있으나 계정 세션이 없습니다. 로그인 후 재확인하세요." : "claude CLI가 없습니다. 설치 후 로그인하세요.";
    steps.textContent = [
      "# 1) Claude Code CLI 설치 (Node 18+)",
      "npm install -g @anthropic-ai/claude-code",
      "",
      "# 2) 로그인 (구독 계정, API 키 불필요)",
      "claude",
      "",
      "# 3) 앱 우측 상단 상태가 연동으로 바뀌면 오피스 탭에서 회의 시작",
    ].join("\n");
  }
}

/* ------------------------------------------------------------------ */
/* Bottom status cards (agent strip)                                    */
/* ------------------------------------------------------------------ */
function buildStatusCards(): void {
  const strip = $("#status-strip");
  if (!strip || strip.childElementCount) return;
  AGENT_KEYS.forEach((key) => {
    const el = document.createElement("div");
    el.className = "stcard";
    el.setAttribute("data-agent", key);
    const cv = makeIconCanvas("office", 18, bodyColorOf(key));
    el.appendChild(cv);
    const names = document.createElement("div");
    names.className = "stc-names";
    names.innerHTML = `<b>${escapeHtml(AGENT_NAMES[key] ?? key)}</b><span class="stc-state" id="stc-${key}">대기</span>`;
    el.appendChild(names);
    strip.appendChild(el);
  });
}

const STATE_LABELS: Record<string, string> = { waiting: "대기", talking: "발언 중", done: "완료" };
function refreshStatusCards(): void {
  AGENT_KEYS.forEach((key) => {
    const el = document.querySelector(`#stc-${key}`) as HTMLElement | null;
    if (el) el.textContent = STATE_LABELS[AGENT_STATES[key]] ?? AGENT_STATES[key];
  });
}

/* ------------------------------------------------------------------ */
/* Wire up                                                            */
/* ------------------------------------------------------------------ */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}
function toast(msg: string, err = false): void {
  const t = document.createElement("div");
  t.className = `toast${err ? " err" : ""}`; t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 5200);
}

function buildLogRows(): void {
  const body = $("#console-body");
  body.innerHTML = "";
  turns.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "log-row";
    row.innerHTML = `<span class="log-idx">${String(i + 1).padStart(2, "0")}</span>
      <span class="log-agent">${escapeHtml(t.agent)}</span><span class="log-text">${escapeHtml(t.content)}</span>`;
    row.addEventListener("click", () => { stopPlayback(); step = i; renderStep(); });
    body.appendChild(row);
  });
  const prog = $("#progress"); prog.innerHTML = "";
  turns.forEach((_, i) => {
    const sp = document.createElement("span");
    sp.addEventListener("click", () => { stopPlayback(); step = i; renderStep(); });
    prog.appendChild(sp);
  });
  ["#play-btn", "#prev-btn", "#next-btn"].forEach((q) => ($(q) as HTMLButtonElement).disabled = false);
  syncPlayBtn();
}

/* ------------------------------------------------------------------ */
/* Auto-trading tab: keys, strategies, approval queue                   */
/* ------------------------------------------------------------------ */
async function refreshBrokerCards(): Promise<void> {
  const st = await window_.api.brokerStatus();
  const ks = await window_.api.killswitchGet();
  ($("#ks-toggle") as HTMLInputElement).checked = ks;
  const ksState = $("#ks-state");
  ksState.textContent = ks ? "ON" : "OFF";
  ksState.className = `badge ${ks ? "ok" : "skip"}`;
  const bin = $("#st-binance");
  bin.textContent = st.binance ? (st.testnet ? "테스트넷 연동" : "연동됨") : "키 미등록";
  bin.className = `c-value ${st.binance ? "ok-text" : "dim"}`;
  const tos = $("#st-toss");
  tos.textContent = st.toss ? "연동됨" : "키 미등록";
  tos.className = `c-value ${st.toss ? "ok-text" : "dim"}`;
  ($("#binance-testnet") as HTMLInputElement).checked = st.testnet;
}

async function saveKeys(): Promise<void> {
  try {
    const pairs: Array<[string, string, string]> = [
      ["binance_api_key", "#binance-key", "바이낸스 API Key"],
      ["binance_api_secret", "#binance-secret", "바이낸스 Secret"],
      ["toss_client_id", "#toss-id", "토스 Client ID"],
      ["toss_client_secret", "#toss-secret", "토스 Secret"],
      ["toss_account_seq", "#toss-seq", "토스 계좌 SEQ"],
    ];
    for (const [key, sel, label] of pairs) {
      const val = ($(sel) as HTMLInputElement).value.trim();
      if (val) await window_.api.vaultSave(key, val);
      else await window_.api.vaultClear(key);
    }
    await window_.api.settingsSet("binance_testnet",
      ($("#binance-testnet") as HTMLInputElement).checked ? "1" : "0");
    (pairs.map((p) => $(p[1]) as HTMLInputElement)).forEach((i) => (i.value = ""));
    toast("키 저장 완료 (OS 키체인 암호화)");
    await refreshBrokerCards();
  } catch (e) {
    toast(`키 저장 실패: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

async function testBalances(): Promise<void> {
  const out = $("#bal-out");
  out.textContent = "잔고 조회 중…";
  try {
    const lines: string[] = [];
    const ks = await window_.api.killswitchGet();
    if (ks) {
      try {
        const b = await window_.api.brokerBalances("binance");
        lines.push(`바이낸스: ${b.length ? b.map((x) => `${x.asset} ${x.free}`).join(", ") : "잔고 없음"}`);
      } catch (e) {
        lines.push(`바이낸스: 실패 (${e instanceof Error ? e.message : String(e)})`);
      }
      try {
        const b = await window_.api.brokerBalances("toss");
        lines.push(`토스: ${b.length ? b.map((x) => `${x.asset} ${x.free}`).join(", ") : "잔고 없음"}`);
      } catch (e) {
        lines.push(`토스: 실패 (${e instanceof Error ? e.message : String(e)})`);
      }
    } else {
      lines.push("킬스위치 OFF 상태 - 브로커 접속 차단 중. 조회하려면 킬스위치 ON.");
    }
    out.textContent = lines.join(" / ");
  } catch (e) {
    out.textContent = `조회 실패: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function refreshStrategies(): Promise<void> {
  const list = await window_.api.strategyList();
  const sched = await window_.api.schedulerStatus();
  const schedMap = new Map(sched.map((s) => [s.id, new Date(s.nextRunAt).toLocaleString("ko-KR")]));
  const tb = $("#strategy-table tbody");
  tb.innerHTML = "";
  list.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.symbol)}</td>
      <td>${s.market === "kr_stock" ? "주식" : "코인"}</td>
      <td><span class="badge ${s.mode === "paper" ? "flat" : "down"}">${s.mode === "paper" ? "모의" : "실거래"}</span></td>
      <td><input type="checkbox" data-sa="${s.id}" ${s.auto ? "checked" : ""} /></td>
      <td>${s.interval_min}분</td>
      <td>${s.approval_mode === "auto" ? "자동" : "수동"}</td>
      <td>${s.live_unlocked ? "해제됨" : "잠금"}</td>
      <td class="dim">${s.auto ? escapeHtml(schedMap.get(s.id) ?? "대기") : "-"}</td>
      <td class="row-btns">
        <button class="mini" data-run="${s.id}">지금 실행</button>
        <button class="mini" data-live="${s.id}">${s.live_unlocked ? "잠그기" : "잠금해제"}</button>
        <button class="mini danger" data-del="${s.id}">삭제</button>
      </td>`;
    tb.appendChild(tr);
  });
  $("#sched-empty").style.display = list.length ? "none" : "block";
  // wire row buttons
  tb.querySelectorAll<HTMLInputElement>("input[data-sa]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      await window_.api.strategyUpdate(Number(cb.getAttribute("data-sa")), { auto: cb.checked });
      await refreshStrategies();
    }));
  tb.querySelectorAll<HTMLButtonElement>("button[data-run]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = Number(b.getAttribute("data-run"));
      b.disabled = true;
      try {
        const r = await window_.api.schedulerRunNow(id);
        toast(`실행 완료: ${r.status} (${r.reason})`, r.status === "failed");
        await Promise.all([refreshStrategies(), refreshApprovals(), refreshPortfolio()]);
      } finally {
        b.disabled = false;
      }
    }));
  tb.querySelectorAll<HTMLButtonElement>("button[data-live]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = Number(b.getAttribute("data-live"));
      const s = list.find((x) => x.id === id);
      if (s?.live_unlocked) {
        await window_.api.strategyUpdate(id, { live_unlocked: 0 });
        toast("실거래 잠금 활성화 (안전 모드)");
      } else {
        await window_.api.strategyUpdate(id, { live_unlocked: 1 });
        toast("실거래 잠금 해제됨", true);
      }
      await refreshStrategies();
    }));
  tb.querySelectorAll<HTMLButtonElement>("button[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = Number(b.getAttribute("data-del"));
      await window_.api.strategyDelete(id);
      toast("전략 삭제됨");
      await refreshStrategies();
    }));
}

async function refreshApprovals(): Promise<void> {
  const list = await window_.api.ordersPending();
  const tb = $("#approval-table tbody");
  tb.innerHTML = "";
  list.forEach((o) => {
    const tr = document.createElement("tr");
    const side = String(o.side);
    tr.innerHTML = `
      <td class="dim">${new Date(String(o.created_at)).toLocaleString("ko-KR")}</td>
      <td>${o.strategy_id ? `#${o.strategy_id}` : "-"}</td><td>${escapeHtml(String(o.symbol))}</td>
      <td><span class="badge ${side === "BUY" ? "up" : "down"}">${side === "BUY" ? "매수" : "매도"}</span></td>
      <td>${Number(o.quantity)}</td><td>${fmtKRW(Number(o.price))}</td>
      <td>${escapeHtml(String(o.broker ?? ""))}</td>
      <td><button class="mini primary" data-ap="${o.id}">승인</button> <button class="mini danger" data-rj="${o.id}">거부</button></td>`;
    tb.appendChild(tr);
  });
  $("#approval-empty").style.display = list.length ? "none" : "block";
  tb.querySelectorAll<HTMLButtonElement>("button[data-ap]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = Number(b.getAttribute("data-ap"));
      b.disabled = true;
      try {
        const r = await window_.api.orderApprove(id);
        toast(`주문 #${id}: ${r.status} (${r.reason})`, r.status === "failed");
        await Promise.all([refreshApprovals(), refreshStrategies()]);
      } finally {
        b.disabled = false;
      }
    }));
  tb.querySelectorAll<HTMLButtonElement>("button[data-rj]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = Number(b.getAttribute("data-rj"));
      await window_.api.orderReject(id);
      toast(`주문 #${id} 거부됨`);
      await refreshApprovals();
    }));
}

function wireAutoTab(): void {
  ($("#ks-toggle") as HTMLInputElement).addEventListener("change", async () => {
    const on = ($("#ks-toggle") as HTMLInputElement).checked;
    const ok = await window_.api.killswitchSet(on);
    toast(ok ? "실거래 킬스위치 ON" : "실거래 킬스위치 OFF", ok);
    await refreshBrokerCards();
  });
  $("#keys-save").addEventListener("click", saveKeys);
  $("#keys-test").addEventListener("click", testBalances);
  $("#ns-add").addEventListener("click", async () => {
    const name = ($("#ns-name") as HTMLInputElement).value.trim();
    const symbol = ($("#ns-symbol") as HTMLInputElement).value.trim();
    if (!name || !symbol) { toast("이름과 종목을 입력하세요", true); return; }
    await window_.api.strategyCreate({
      name,
      symbol,
      market: ($("#ns-market") as HTMLSelectElement).value,
      mode: ($("#ns-mode") as HTMLSelectElement).value,
      auto: ($("#ns-auto") as HTMLSelectElement).value === "1",
      interval_min: Number(($("#ns-interval") as HTMLInputElement).value) || 60,
      approval_mode: ($("#ns-approval") as HTMLSelectElement).value,
      live_unlocked: ($("#ns-live") as HTMLSelectElement).value === "1",
    });
    ($("#ns-name") as HTMLInputElement).value = "";
    ($("#ns-symbol") as HTMLInputElement).value = "";
    toast("전략 추가됨");
    await refreshStrategies();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  // tab switching
  $$(".tab-btn").forEach((b) => b.addEventListener("click", () => {
    $$(".tab-btn").forEach((x) => x.classList.remove("active"));
    $$(".tab").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    const tab = $(`#tab-${b.getAttribute("data-tab")}`);
    tab.classList.add("active");
    if (b.getAttribute("data-tab") === "portfolio") refreshPortfolio();
    if (b.getAttribute("data-tab") === "settings") refreshClaude();
    if (b.getAttribute("data-tab") === "auto") {
      Promise.all([refreshBrokerCards(), refreshStrategies(), refreshApprovals()]).catch(() => undefined);
    }
  }));

  // refresh portfolio periodically for continuous state sync
  setInterval(() => {
    if (($("#tab-portfolio") as HTMLElement).classList.contains("active")) refreshPortfolio().catch(() => undefined);
  }, 15000);

  // top-down office floor + status cards
  const fl = ensureFloor();
  if (fl) fl.start();
  buildStatusCards();

  // run meeting
  $("#run-btn").addEventListener("click", async () => {
    const input = ($("#symbol-input") as HTMLInputElement).value.trim() || "BTC";
    ($("#run-btn") as HTMLButtonElement).disabled = true;
    stopPlayback(); turns = []; clearStage(); $("#console-body").innerHTML = "";
    $("#run-meta").textContent = "데이터 로딩 중...";
    try {
      const [resolve, snap] = await Promise.all([
        window_.api.marketResolve(input), window_.api.marketSnapshot(input),
      ]);
      drawChart(snap);
      $("#run-meta").textContent = `${snap.name}·${snap.symbol} · ${snap.source === "synthetic" ? "합성 데이터" : snap.source} · MA10/30·RSI 계산 완료 → 에이전트 회의 중…`;
      const out = await window_.api.meetingRun(input);
      turns = out.turns;
      buildLogRows();
      step = 0; renderStep();
      // decision panel
      const dp = $("#dp-action");
      dp.textContent = out.action === "BUY" ? "매수 BUY" : out.action === "SELL" ? "매도 SELL" : "홀드 HOLD";
      dp.className = out.action;
      $("#dp-symbol").textContent = `${snap.name} (${snap.symbol})`;
      $("#dp-order").textContent = out.order ? `BUY ${out.order.quantity} @ ${fmtKRW(out.order.price)}` : "주문 없음";
      $("#dp-conf").textContent = `${(out.confidence * 100).toFixed(0)}%`;
      $("#dp-engine").textContent = out.engine === "claude" ? "Claude" : out.engine === "demo" ? "데모(룰베이스)" : out.engine;
      toast(out.degraded ? `[주의] ${out.degraded}` : `회의 완료 — ${dp.textContent}`, !!out.degraded && out.engine === "demo");
      autoPlay = true; syncPlayBtn(); scheduleNext();
    } catch (e) {
      toast(`회의 실패: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      ($("#run-btn") as HTMLButtonElement).disabled = false;
    }
  });

  // playback controls
  $("#play-btn").addEventListener("click", () => { autoPlay = !autoPlay; syncPlayBtn(); scheduleNext(); });
  $("#prev-btn").addEventListener("click", () => { stopPlayback(); step = Math.max(0, step - 1); renderStep(); });
  $("#next-btn").addEventListener("click", () => { stopPlayback(); step = Math.min(turns.length - 1, step + 1); renderStep(); });

  // engine select
  const es = $("#engine-select") as HTMLSelectElement;
  window_.api.settingsGet("engine").then((v) => { es.value = v || "auto"; });
  es.addEventListener("change", () => window_.api.settingsSet("engine", es.value));

  wireAutoTab();
  mountIcons();
  syncPlayBtn();  // paint initial play icon (was blank before first meeting)
  refreshClaude();
  refreshPortfolio();
});
