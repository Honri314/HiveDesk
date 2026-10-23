/* Order executor with safety gates (rule 3).
 *
 * Gates, in order:
 *  1. action HOLD -> skipped (no order)
 *  2. confidence < 0.60 in auto mode -> hold (skipped)
 *  3. paper mode -> PaperBroker fill at market price
 *  4. real mode requires: global kill switch ON + strategy.live_unlocked
 *     - not unlocked -> order recorded as 'skipped' with reason (double-lock)
 *     - approval_mode manual -> 'pending' (queued for human approval)
 *     - approval_mode auto   -> broker submit immediately
 *  5. funds: BUY <= available cash (paper) / quote balance (real, checked
 *     against broker balances before submit); SELL requires a held position
 */
import { cashBalance, adjustCash, saveOrder, setOrderStatus, getStrategy,
         getOrder, getSetting, positions, type StrategyRow } from "./store";
import { PaperBroker } from "./brokers/paper";
import { BinanceBroker, type BinanceCreds } from "./brokers/binance";
import { TossBroker, type TossCreds } from "./brokers/toss";
import type { Broker } from "./brokers/types";
import { snapshot } from "./market";
import type { PlanOrder } from "./types";
import { loadSecret, hasSecret } from "./vault";

const AUTO_MIN_CONF = 0.6;

export function realTradingEnabled(): boolean {
  return getSetting("real_trading_enabled", "0") === "1";
}

export function resolveBroker(strategy: StrategyRow): Broker {
  if (strategy.mode === "paper") return new PaperBroker();
  if (strategy.market === "kr_stock") {
    const clientId = loadSecret("toss_client_id");
    const clientSecret = loadSecret("toss_client_secret");
    const accountSeq = loadSecret("toss_account_seq");
    if (!clientId || !clientSecret || !accountSeq) {
      throw new Error("토스증권 키 미등록");
    }
    return new TossBroker({ clientId, clientSecret, accountSeq });
  }
  const apiKey = loadSecret("binance_api_key");
  const apiSecret = loadSecret("binance_api_secret");
  if (!apiKey || !apiSecret) throw new Error("바이낸스 키 미등록");
  const testnet = getSetting("binance_testnet", "1") === "1";
  return new BinanceBroker({ apiKey, apiSecret, testnet } as BinanceCreds);
}

export interface ExecuteInput {
  strategyId: number | null;
  decisionId: number | null;
  plan: PlanOrder | null;
  action: string;
  confidence: number;
  source: "manual" | "auto";
}

export interface ExecuteResult {
  status: "filled" | "pending" | "skipped" | "failed";
  reason: string;
  broker?: string;
  brokerOrderId?: string;
}

export async function execute(input: ExecuteInput): Promise<ExecuteResult> {
  const strategy = input.strategyId ? getStrategy(input.strategyId) : null;
  const symbol = strategy?.symbol ?? "";

  if (input.action === "HOLD" || !input.plan) {
    return { status: "skipped", reason: "홀드 또는 주문 계획 없음" };
  }
  if (input.source === "auto" && input.confidence < AUTO_MIN_CONF) {
    return { status: "skipped", reason: `자동 모드 확신도 미달 (${Math.round(input.confidence * 100)}% < 60%)` };
  }

  const mode = strategy?.mode ?? "paper";
  const plan = input.plan;

  if (mode === "paper") {
    const snap = await snapshot(symbol || "BTC-USD");
    const price = plan.price > 0 ? plan.price : snap.last;
    const cash = cashBalance();
    if (plan.side === "BUY" && price * plan.quantity > cash * (1 + 0.001)) {
      return { status: "skipped", reason: "모의 현금 부족" };
    }
    if (plan.side === "SELL") {
      const pos = positions()[symbol];
      if (!pos || pos.qty <= 0) return { status: "skipped", reason: "보유 포지션 없음" };
    }
    saveOrder({
      decisionId: input.decisionId, strategyId: input.strategyId, symbol,
      side: plan.side, quantity: plan.quantity, price, status: "filled",
      reason: plan.reason, broker: "paper",
    });
    if (plan.side === "BUY") adjustCash(-(price * plan.quantity));
    else adjustCash(price * plan.quantity);
    return { status: "filled", reason: "모의 체결", broker: "paper" };
  }

  /* ---- real mode ---- */
  if (!realTradingEnabled()) {
    saveOrder({
      decisionId: input.decisionId, strategyId: input.strategyId, symbol, side: plan.side,
      quantity: plan.quantity, price: plan.price, status: "skipped",
      reason: "실거래 전역 킬스위치 OFF", broker: strategy?.market === "kr_stock" ? "toss" : "binance",
    });
    return { status: "skipped", reason: "실거래 전역 킬스위치 OFF" };
  }
  if (!strategy || !strategy.live_unlocked) {
    saveOrder({
      decisionId: input.decisionId, strategyId: input.strategyId, symbol, side: plan.side,
      quantity: plan.quantity, price: plan.price, status: "skipped",
      reason: "전략 실거래 잠금 미해제", broker: strategy?.market === "kr_stock" ? "toss" : "binance",
    });
    return { status: "skipped", reason: "전략 실거래 잠금 미해제" };
  }

  const broker = resolveBroker(strategy);
  const brokerId = strategy.market === "kr_stock" ? "toss" : "binance";

  if ((strategy.approval_mode ?? "manual") === "manual") {
    const id = saveOrder({
      decisionId: input.decisionId, strategyId: input.strategyId, symbol, side: plan.side,
      quantity: plan.quantity, price: plan.price, status: "pending",
      reason: "수동 승인 대기", broker: brokerId,
    });
    return { status: "pending", reason: `승인 대기 (주문 #${id})`, broker: brokerId };
  }

  return submitReal(input.strategyId, input.decisionId, plan, broker, brokerId);
}

/** Submit a pending (or fresh) order to the real broker after re-checking gates. */
export async function submitReal(
  strategyId: number | null,
  decisionId: number | null,
  plan: PlanOrder,
  broker: Broker,
  brokerId: string,
  orderId?: number
): Promise<ExecuteResult> {
  const strategy = strategyId ? getStrategy(strategyId) : null;
  const symbol = strategy?.symbol ?? "";
  try {
    // balance check for BUY: available quote asset
    if (plan.side === "BUY") {
      const balances = await broker.balances();
      const quoteAsset = brokerId === "toss" ? "KRW" : "USDT";
      const free = balances.find((b) => b.asset === quoteAsset)?.free ?? 0;
      const price = brokerId === "toss" ? plan.price : (await broker.quote(symbol)) || plan.price;
      if (price * plan.quantity > free) {
        if (orderId) setOrderStatus(orderId, "failed", "실제 잔고 부족");
        return { status: "failed", reason: `실제 ${quoteAsset} 잔고 부족 (${free})`, broker: brokerId };
      }
    } else {
      const balances = await broker.balances();
      const baseAsset = brokerId === "toss" ? symbol.replace(/\.KS$/, "") : symbol.replace(/USDT$/, "");
      const free = balances.find((b) => b.asset === baseAsset)?.free ?? 0;
      if (free < plan.quantity) {
        if (orderId) setOrderStatus(orderId, "failed", "보유 수량 부족");
        return { status: "failed", reason: `실제 보유 ${baseAsset} 부족 (${free})`, broker: brokerId };
      }
    }
    const res = await broker.marketOrder(symbol, plan.side === "SELL" ? "SELL" : "BUY", plan.quantity);
    if (orderId) {
      setOrderStatus(orderId, "filled", `브로커 체결 (${res.status})`, brokerId, res.brokerOrderId);
    } else {
      saveOrder({
        decisionId, strategyId, symbol, side: plan.side, quantity: plan.quantity,
        price: plan.price, status: "filled", reason: `실거래 체결 (${res.status})`,
        broker: brokerId, brokerOrderId: res.brokerOrderId,
      });
    }
    return { status: "filled", reason: `실거래 ${res.status}`, broker: brokerId, brokerOrderId: res.brokerOrderId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (orderId) setOrderStatus(orderId, "failed", msg.slice(0, 200), brokerId);
    return { status: "failed", reason: msg.slice(0, 200), broker: brokerId };
  }
}

export function brokerStatus(): { binance: boolean; toss: boolean; killSwitch: boolean; testnet: boolean } {
  return {
    binance: hasSecret("binance_api_key") && hasSecret("binance_api_secret"),
    toss: hasSecret("toss_client_id") && hasSecret("toss_client_secret") && hasSecret("toss_account_seq"),
    killSwitch: realTradingEnabled(),
    testnet: getSetting("binance_testnet", "1") === "1",
  };
}

export async function approveOrder(orderId: number): Promise<ExecuteResult> {
  const order = getOrder(orderId);
  if (!order || order.status !== "pending") {
    return { status: "failed", reason: "승인 대기 주문 없음" };
  }
  if (!realTradingEnabled()) {
    setOrderStatus(orderId, "rejected", "전역 킬스위치 OFF 상태에서 승인 시도");
    return { status: "failed", reason: "전역 킬스위치 OFF" };
  }
  const strategy = order.strategy_id ? getStrategy(order.strategy_id) : null;
  if (!strategy?.live_unlocked) {
    setOrderStatus(orderId, "rejected", "전략 잠금 미해제 상태에서 승인 시도");
    return { status: "failed", reason: "전략 실거래 잠금 미해제" };
  }
  const broker = resolveBroker(strategy);
  const brokerId = strategy.market === "kr_stock" ? "toss" : "binance";
  return submitReal(order.strategy_id, order.decision_id, {
    side: order.side === "SELL" ? "SELL" : "BUY",
    quantity: order.quantity,
    price: order.price,
    reason: order.reason ?? "",
  }, broker, brokerId, orderId);
}

export function rejectOrder(orderId: number, reason: string): void {
  setOrderStatus(orderId, "rejected", reason || "사용자 거부");
}
