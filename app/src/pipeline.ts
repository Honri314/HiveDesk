/* Multi-agent trading pipeline (TradingAgents role structure).
 *
 * Phase 1: 4 analysts read the same market snapshot.
 * Phase 2: bull vs bear debate (1 round each) + research manager verdict.
 * Phase 3: trader proposes an order plan.
 * Phase 4: risk manager reviews; PM sizes and approves / rejects / holds.
 *
 * Live mode: each turn is one Claude Agent SDK call with a role system prompt
 * (the user's subscription account). Demo mode: deterministic rules +
 * persona accents so the full pipeline demos without a Claude account.
 */
import type { Action, Mood, PlanOrder, Turn } from "./types";
import { AGENT_LIST, type AgentDef } from "./types";
import { fmtPrice, type Snapshot } from "./market";
import { runClaude, claudeStatus } from "./claude";

export interface PipelineResult {
  turns: Turn[];
  action: Action;
  confidence: number;
  reasoning: string;
  order: PlanOrder | null;
  engine: "claude" | "demo";
  degraded: string | null;
}

const AG = (key: string): AgentDef => {
  const a = AGENT_LIST.find((x) => x.key === key);
  if (!a) throw new Error(`unknown agent ${key}`);
  return a;
};

const T = (key: string, mood: Mood, content: string, seq: number): Turn => ({
  key,
  agent: AG(key).name,
  mood,
  ts: new Date(Date.now() + seq * 1300).toISOString(),
  content,
});

const fmt = fmtPrice;
const RISK_MAX_BUDGET_RATIO = 0.2;

export function tradeBrief(snap: Snapshot): string {
  return [
    `[${snap.name} (${snap.symbol}) — 데이터소스: ${snap.source}]`,
    `현재가 ${fmt(snap.last)} · MA10 ${fmt(snap.ma10)} · MA30 ${fmt(snap.ma30)} · RSI14 ${snap.rsi14.toFixed(1)}`,
    `MACD ${snap.macdLine.toFixed(2)} vs Signal ${snap.macdSignal.toFixed(2)}`,
    `    최근 종가 5일: ${snap.candles.slice(-5).map((c: { c: number }) => fmt(c.c)).join(" → ")}`,
  ].join("\n");
}

/* ---------------- demo mode (rule-based, no account needed) ---------------- */

function demoTurns(snap: Snapshot, action: Action, conf: number): Turn[] {
  const trend = snap.ma10 > snap.ma30 ? "상승" : snap.ma10 < snap.ma30 ? "하락" : "횡보";
  const seqOf: Record<string, number> = {
    market_analyst: 0, news_analyst: 1, sentiment_analyst: 2, fundamentals_analyst: 3,
    bull_researcher: 4, bear_researcher: 5, research_manager: 6, trader: 7,
    risk_manager: 8, portfolio_manager: 9,
  };
  const mk = (key: string, mood: Mood, content: string): Turn => T(key, mood, content, seqOf[key]);
  const turns: Turn[] = [];

  turns.push(mk("market_analyst", "data",
    `첨… 데이터 정리합니다. MA10 ${fmt(snap.ma10)} / MA30 ${fmt(snap.ma30)}, RSI14 ${snap.rsi14.toFixed(1)}, 현재가 ${fmt(snap.last)}. ${trend} 추세, MACD는 ${snap.macdLine > snap.macdSignal ? "양(+)전환" : "음(−)전환"} 상태입니다.`));
  turns.push(mk("news_analyst", "idle",
    `흠… 데모 모드에서는 실시간 뉴스를 읽지 않습니다. Claude 계정을 연동하면 실제 뉴스·공시 해석이 켜집니다. (데이터 소스: ${snap.source})`));
  turns.push(mk("sentiment_analyst", "think",
    `훗, RSI ${snap.rsi14.toFixed(1)} — ${snap.rsi14 >= 70 ? "과매수권이라 단기 조심" : snap.rsi14 <= 30 ? "과매도권, 반등 에너지가 쌓이는 중" : "중립권입니다"}. 추세(${trend})와 ${snap.rsi14 > 50 === (trend === "상승") ? "방향이 일치해 신뢰도가 있습니다" : "방향이 어긋나 확신은 낮습니다"}.`));
  turns.push(mk("fundamentals_analyst", "idle",
    `크흠. 현재가 ${fmt(snap.last)}는 MA30 대비 ${((snap.last / snap.ma30 - 1) * 100).toFixed(1)}% 수준. ${snap.source === "synthetic" ? "[경고] 오프라인 합성 데이터 기준입니다." : "공개 시세 데이터 기준입니다."}`));

  if (action === "BUY") {
    turns.push(mk("bull_researcher", "excited",
      `해서는 안 될 이유를 못 찾겠습니다! 골든크로스가 확인됐고 RSI ${snap.rsi14.toFixed(1)}로 과매수도 아닙니다. 지금 안 사면 언제 사나요?`));
    turns.push(mk("bear_researcher", "suspicious",
      `흠, 되밀기를 조심하세요. 이동평균은 뒤따르는 지표라 전환 초입엔 가짜 돌파도 흔합니다. 분할 진입이 낫습니다.`));
  } else if (action === "SELL") {
    turns.push(mk("bear_researcher", "excited",
      `데이터가 명확합니다. 데드크로스 진행 중이고 반등 근거 약함. 비중 축소가 맞습니다.`));
    turns.push(mk("bull_researcher", "suspicious",
      `첨, 과매도면 반등可能性도 있습니다. 전량 매도보다는 관망·분할이 낫다고 봅니다.`));
  } else {
    turns.push(mk("bull_researcher", "think",
      `첨, 매수 근거가 아직 부족합니다. 추세가 살아나면 그때 진입해도 늦지 않습니다.`));
    turns.push(mk("bear_researcher", "think",
      `동의합니다. 데드크로스 확정 전까지 매도도 성급합니다. 관망이 기대값이 가장 높습니다.`));
  }
  const rm = mk("research_manager", "talk",
    `정리합니다. 신호는 ${action} 방향으로 기울어 있고, 리서처 논쟁을 종합하면 트레이더에게 ${action} 계획을 요청하는 게 적절합니다. (확신도 ${(conf * 100).toFixed(0)}%)`);
  turns.push(rm);
  return turns;
}

export function demoTradePlan(snap: Snapshot, action: Action, cash: number): { turn: Turn; plan: PlanOrder | null; reasoning: string } {
  const conf = baseConfidence(action, snap);
  if (action === "HOLD" || action === "SELL") {
    return {
      turn: T("trader", action === "HOLD" ? "idle" : "data",
        action === "HOLD"
          ? `신규 진입 보류합니다. 확신도 ${(conf * 100).toFixed(0)}%로 임계 미달. 다음 사이클 재평가.`
          : `매도안은 보유 포지션이 있을 때만 유효합니다. 현재 보유수량을 확인한 뒤 결정하겠습니다.`, 7),
      plan: null,
      reasoning: action === "HOLD" ? "확신도 미달로 홀드" : "매도 대상 보유 없음 (모의 체결 규칙)",
    };
  }
  const budget = Math.min(cash, cash * RISK_MAX_BUDGET_RATIO);
  const qty = Math.floor((budget / snap.last) * 100) / 100;
  const plan: PlanOrder | null = qty > 0
    ? { side: "BUY", quantity: qty, price: snap.last, reason: `예산 한도 내 분할 진입 (현금의 ${RISK_MAX_BUDGET_RATIO * 100}% 이하)` }
    : null;
  return {
    turn: T("trader", "data",
      plan ? `${snap.name} 매수안 제출: ${fmt(Math.round(budget))} 규모, 필요 수량 ${qty}. 손절 -5% 라인 준수 조건.` : "현금 부족으로 주문 불가", 7),
    plan,
    reasoning: plan ? `MA10/MA30 정배열 + RSI ${snap.rsi14.toFixed(1)} (과열 아님)` : "현금 부족",
  };
}

export function baseConfidence(action: Action, snap: Snapshot): number {
  const sep = Math.abs(snap.ma10 - snap.ma30) / (snap.last || 1);
  const raw = 0.5 + sep * 6 + Math.abs(snap.rsi14 - 50) / 220;
  return action === "HOLD"
    ? Math.min(0.7, Math.max(0.35, raw * 0.8))
    : Math.min(0.92, Math.max(0.55, raw));
}

/* ---------------- live mode (Claude Agent SDK) ---------------- */

const sys = (role: string, extra: string) =>
  `당신은 한국어로만 발화하는 멀티 에이전트 트레이딩 회사의 ${role}입니다. ${extra}\n` +
  "형식: 발화 본문만 출력 (인사, 번호, 분석표 없음). 두 문장 이내로 압축. " +
  "모의거래 시뮬레이션이며 실제 투자 조언이 아님을 인지하고 있습니다.";

async function turn(key: string, mood: Mood, system: string, prompt: string, seq: number): Promise<Turn> {
  const def = AG(key);
  let text = "";
  try {
    text = await runClaude({ system, prompt });
  } catch {
    text = "";
  }
  return T(key, mood, text || `(발화 없음 — 데모 폴백: ${def.role} 역할 수행)`, seq);
}

/* ---------------- orchestrator ---------------- */

export async function runPipeline(snap: Snapshot, cash: number): Promise<PipelineResult> {
  const status = await claudeStatus();
  const live = status.cli && status.loggedIn;
  const degraded: string | null =
    snap.source === "synthetic" ? "오프라인 합성 가격 데이터" : null;

  const rawAction = trigger(snap);
  const conf = baseConfidence(rawAction, snap);

  if (!live) {
    const turns = demoTurns(snap, rawAction, conf);
    const trade = demoTradePlan(snap, rawAction, cash);
    turns.push(trade.turn);
    turns.push(
      T("risk_manager", rawAction === "BUY" ? "suspicious" : "idle",
        rawAction === "BUY" && trade.plan
          ? `조건부 승인. 손절 -5% 이탈 시 즉시 청산. RSI 70 초과 시 추가 매수 금지 (현재 ${snap.rsi14.toFixed(1)}). 총예산 대비 주문 한도 ${RISK_MAX_BUDGET_RATIO * 100}% 적용.`
          : "리스크 관점에서도 관망/보수가 맞습니다.", 8));
    turns.push(T("portfolio_manager", rawAction === "BUY" && trade.plan ? "excited" : "idle",
      trade.plan
        ? `최종 승인: BUY ${trade.plan.quantity} @ ${fmt(trade.plan.price)} (모의 체결, 확신도 ${(conf * 100).toFixed(0)}%).`
        : `최종 결정: ${rawAction}. 주문 없음. (확신도 ${(conf * 100).toFixed(0)}%)`, 9));
    return {
      turns, action: rawAction, confidence: conf,
      reasoning: trade.reasoning, order: trade.plan, engine: "demo",
      degraded: degraded ?? "Claude 미연동 — 데모(룰베이스) 엔진",
    };
  }

  /* live path: each phase asks Claude. Any thrown auth error falls back. */
  try {
    const brief = tradeBrief(snap);
    const seqOf: Record<string, number> = { market_analyst: 0, news_analyst: 1, sentiment_analyst: 2, fundamentals_analyst: 3 };
    const aDef = [AG("market_analyst"), AG("news_analyst"), AG("sentiment_analyst"), AG("fundamentals_analyst")];
    const aTurns: Turn[] = [];
    for (const a of aDef) {
      aTurns.push(await turn(a.key, a.key === "market_analyst" ? "data" : "talk",
        sys(a.role, "당신의 전문 영역 데이터만 근거로 발언하세요."),
        `시세 스냅샷:\n${brief}\n\n위 데이터를 기준으로 당신 역할의 1~2문장 분석 발언을 하세요.`, seqOf[a.key]));
    }

    const debateTurns: Turn[] = [];
    debateTurns.push(await turn("bull_researcher", "excited",
      sys("강세 리서처", "매수 논거를 찾아 주장하고 상대 반박에 대응합니다."),
      `시세:\n${brief}\n\n애널리스트 발언:\n${aTurns.map((t) => `${t.agent}: ${t.content}`).join("\n")}\n\n매수 논거를 1~2문장으로 주장하세요.`, 4));
    debateTurns.push(await turn("bear_researcher", "suspicious",
      sys("약세 리서처", "하락/리스크 논거를 찾아 강세 주장을 반박합니다."),
      `시세:\n${brief}\n\n강세 리서처 발언:\n${debateTurns[0].content}\n\n반박을 1~2문장으로 하세요.`, 5));
    const researchVerdict = `${debateTurns.map(t => `${t.agent}: ${t.content}`).join(" / ")}`;
    const rmTurn = await turn("research_manager", "talk",
      sys("리서치 총괄", "토론을 중재하고 결론 방향을 제안합니다."),
      `토론:\n${researchVerdict}\n\n1~2문장 중재 결론. (BUY/SELL/HOLD 중 방향성 언급)`, 6);

    const traderTurn = await turn("trader", "data",
      sys("트레이더", "진입가/수량/손절 포함 매매안을 단정적으로 제출합니다."),
      `시세:\n${brief}\n현금 ${fmt(Math.round(cash))}원 · 종목당 주문 한도 현금의 ${RISK_MAX_BUDGET_RATIO * 100}%\n토론 결론: ${rmTurn.content}\n\n매수/매도/홀드 중 결정해 이유와 함께 1~2문장으로 제출하세요.`, 7);

    const riskTurn = await turn("risk_manager", "suspicious",
      sys("리스크 매니저", "손절, 비중, 변동성 관점을 검증합니다."),
      `시세:\n${brief}\n트레이더 매매안: ${traderTurn.content}\n\n리스크 검증 의견을 1~2문장으로.`, 8);

    const pmTurn = await turn("portfolio_manager", "talk",
      sys("포트폴리오 매니저", "최종 승인/기각/수정을 결정합니다."),
      `시세:\n${brief}\n트레이더: ${traderTurn.content}\n리스크: ${riskTurn.content}\n\n최종 결정(승인 BUY/SELL 중 하나 또는 기각→HOLD)을 1~2문장으로.`, 9);

    const all = [...aTurns, ...debateTurns, rmTurn, traderTurn, riskTurn, pmTurn];
    const blob = all.map((t) => `${t.agent}: ${t.content}`).join("\n");
    const decided = decide(blob, rawAction);
    const order = planOrder(decided.action, snap, cash);
    return {
      turns: all, action: decided.action, confidence: decided.conf,
      reasoning: traderTurn.content, order, engine: "claude",
      degraded,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const turns = demoTurns(snap, rawAction, conf);
    const trade = demoTradePlan(snap, rawAction, cash);
    turns.push(trade.turn);
    turns.push(T("portfolio_manager", "idle", `Claude 호출 실패(${msg.slice(0, 40)}) → 데모 폴백. ${trade.plan ? "BUY 승인" : `${rawAction} 승인`}`, 9));
    return { turns, action: rawAction, confidence: conf, reasoning: trade.reasoning, order: trade.plan, engine: "demo", degraded: `Claude 오류 → 데모 폴백` };
  }
}

/* final action: PM text decides between BUY/SELL/HOLD; falls back to raw signal */
function decide(blob: string, rawAction: Action): { action: Action; conf: number } {
  const buy = /BUY|매수 승인|승인: BUY|매수합니다/.test(blob);
  const sell = /SELL|매도 승인|승인: SELL|매도합니다/.test(blob);
  const action: Action = buy && !sell ? "BUY" : sell && !buy ? "SELL" : rawAction;
  const pct = blob.match(/(\d{1,3})%/);
  const conf = pct ? Math.min(0.95, Math.max(0.4, Number(pct[1]) / 100)) : baseConfidence(action, phonySnapshot());
  return { action, conf };
}

function planOrder(action: Action, snap: Snapshot, cash: number): PlanOrder | null {
  if (action !== "BUY") return null;
  const budget = Math.min(cash, cash * RISK_MAX_BUDGET_RATIO);
  const qty = Math.floor((budget / snap.last) * 100) / 100;
  return qty > 0 ? { side: "BUY", quantity: qty, price: snap.last, reason: `PM 승인 — 현금의 ${RISK_MAX_BUDGET_RATIO * 100}% 이하` } : null;
}

function phonySnapshot(): Snapshot {
  return { symbol: "x", name: "x", source: "synthetic", last: 1, ma10: 1, ma30: 1, rsi14: 50, macdLine: 0, macdSignal: 0, candles: [] };
}

function trigger(snap: Snapshot): Action {
  if (snap.ma10 > snap.ma30 && snap.rsi14 < 72) return "BUY";
  if (snap.ma10 < snap.ma30 && snap.rsi14 > 28) return "SELL";
  return "HOLD";
}
