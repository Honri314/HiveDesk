/* Auto-trading scheduler.
 * One timer per auto-enabled strategy. Each tick: market snapshot ->
 * pipeline (Claude or demo) -> executor with safety gates. */
import type { StrategyRow } from "./store";
import { autoStrategies, startMeeting, addTurn, finishMeeting, saveDecision } from "./store";
import { snapshot } from "./market";
import { runPipeline } from "./pipeline";
import { execute } from "./executor";

interface Running {
  timer: ReturnType<typeof setInterval>;
  nextRunAt: number;
}

const running = new Map<number, Running>();

async function runCycle(strategy: StrategyRow): Promise<{ status: string; reason: string }> {
  const snap = await snapshot(strategy.symbol);
  const engine = "auto";
  const meetingId = startMeeting(strategy.symbol, strategy.market, engine, strategy.id);
  const result = await runPipeline(snap, 10_000_000);
  result.turns.forEach((t, i) => addTurn(meetingId, i, t));
  finishMeeting(meetingId, result.action, result.confidence);
  const decisionId = saveDecision(meetingId, {
    action: result.action,
    confidence: result.confidence,
    symbol: strategy.symbol,
    order: result.order,
  }, result.reasoning, strategy.id);

  const outcome = await execute({
    strategyId: strategy.id,
    decisionId,
    plan: result.order,
    action: result.action,
    confidence: result.confidence,
    source: "auto",
  });
  return { status: outcome.status, reason: outcome.reason };
}

function armTimer(strategy: StrategyRow): void {
  stop(strategy.id);
  const interval = Math.max(5, strategy.interval_min) * 60_000;
  const timer = setInterval(() => {
    const st = autoStrategies().find((s) => s.id === strategy.id);
    if (!st) {
      // strategy disabled or deleted while timer alive: leave, will be re-armed on reload
      return;
    }
    runCycle(st)
      .catch((e) => console.error(`[scheduler] strategy ${st.id} cycle failed:`, e))
      .finally(() => {
        const r = running.get(st.id);
        if (r) r.nextRunAt = Date.now() + Math.max(5, st.interval_min) * 60_000;
      });
  }, interval);
  running.set(strategy.id, { timer, nextRunAt: Date.now() + interval });
}

export function reload(): { running: number[]; armed: number[] } {
  for (const [, r] of running) clearInterval(r.timer);
  running.clear();
  const list = autoStrategies();
  list.forEach(armTimer);
  return { running: [...running.keys()], armed: list.map((s) => s.id) };
}

export function stop(strategyId: number): void {
  const r = running.get(strategyId);
  if (r) {
    clearInterval(r.timer);
    running.delete(strategyId);
  }
}

export function status(): Array<{ id: number; nextRunAt: string }> {
  return [...running.entries()].map(([id, r]) => ({ id, nextRunAt: new Date(r.nextRunAt).toISOString() }));
}

/** Run one cycle immediately (UI button / tests). */
export async function runNow(strategyId: number): Promise<{ status: string; reason: string; meetingId: number | null }> {
  const st = autoStrategies().find((s) => s.id === strategyId)
    ?? (await import("./store")).getStrategy(strategyId);
  if (!st) return { status: "failed", reason: "전략 없음", meetingId: null };
  const snap = await snapshot(st.symbol);
  const meetingId = startMeeting(st.symbol, st.market, "auto-manual", st.id);
  const result = await runPipeline(snap, 10_000_000);
  result.turns.forEach((t, i) => addTurn(meetingId, i, t));
  finishMeeting(meetingId, result.action, result.confidence);
  const decisionId = saveDecision(meetingId, {
    action: result.action, confidence: result.confidence, symbol: st.symbol, order: result.order,
  }, result.reasoning, st.id);
  const outcome = await execute({
    strategyId: st.id, decisionId, plan: result.order, action: result.action,
    confidence: result.confidence, source: "manual",
  });
  return { status: outcome.status, reason: outcome.reason, meetingId };
}
