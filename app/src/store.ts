/* SQLite persistence.
 * Tables: strategies / meetings / turns / decisions / orders / cash / settings
 * All writes append; reads are used to rebuild the UI. */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Turn, Decision } from "./types";

let db: Database.Database | null = null;

export function initDb(userDataDir: string): void {
  if (db) return;
  const dir = join(userDataDir, "hivedesk");
  mkdirSync(dir, { recursive: true });
  db = new Database(join(dir, "trading.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL DEFAULT 'crypto',
      mode TEXT NOT NULL DEFAULT 'paper',
      auto INTEGER NOT NULL DEFAULT 0,
      interval_min INTEGER NOT NULL DEFAULT 30,
      budget REAL NOT NULL DEFAULT 1000000,
      stop_loss_pct REAL NOT NULL DEFAULT 0.05,
      take_profit_pct REAL NOT NULL DEFAULT 0.10,
      approval_mode TEXT NOT NULL DEFAULT 'manual',
      live_unlocked INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      engine TEXT NOT NULL DEFAULT 'demo',
      action TEXT,
      confidence REAL,
      strategy_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      key TEXT NOT NULL,
      agent TEXT NOT NULL,
      mood TEXT NOT NULL,
      ts TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      strategy_id INTEGER,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      confidence REAL NOT NULL,
      reasoning TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_id INTEGER REFERENCES decisions(id) ON DELETE SET NULL,
      strategy_id INTEGER,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      status TEXT NOT NULL,          -- pending | filled | rejected | failed | skipped
      reason TEXT,
      broker TEXT,
      broker_order_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cash (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // upgrade older dev DBs (best effort)
  try {
    db.exec("ALTER TABLE orders ADD COLUMN strategy_id INTEGER");
    db.exec("ALTER TABLE orders ADD COLUMN broker TEXT");
    db.exec("ALTER TABLE orders ADD COLUMN broker_order_id TEXT");
    db.exec("ALTER TABLE meetings ADD COLUMN strategy_id INTEGER");
    db.exec("ALTER TABLE decisions ADD COLUMN strategy_id INTEGER");
  } catch { /* already migrated */ }
  const cash = db.prepare("SELECT balance FROM cash WHERE id = 1").get() as
    | { balance: number }
    | undefined;
  if (!cash) {
    db.prepare("INSERT INTO cash (id, balance) VALUES (1, ?)").run(10_000_000);
  }
}

function must(): Database.Database {
  if (!db) throw new Error("db not initialized");
  return db;
}

/* ---------------- strategies ---------------- */

export interface StrategyRow {
  id: number;
  name: string;
  symbol: string;
  market: string;
  mode: string;
  auto: number;
  interval_min: number;
  budget: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  approval_mode: string;
  live_unlocked: number;
  active: number;
  created_at: string;
}

export function createStrategy(data: Partial<StrategyRow> & { name: string; symbol: string }): StrategyRow {
  const now = new Date().toISOString();
  const info = must()
    .prepare(
      "INSERT INTO strategies (name, symbol, market, mode, auto, interval_min, budget," +
      " stop_loss_pct, take_profit_pct, approval_mode, live_unlocked, active, created_at)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)"
    )
    .run(
      data.name, data.symbol, data.market ?? "crypto", data.mode ?? "paper",
      data.auto ? 1 : 0, data.interval_min ?? 30, data.budget ?? 1_000_000,
      data.stop_loss_pct ?? 0.05, data.take_profit_pct ?? 0.10,
      data.approval_mode ?? "manual", now
    );
  return getStrategy(Number(info.lastInsertRowid))!;
}

export function getStrategy(id: number): StrategyRow | null {
  return (must().prepare("SELECT * FROM strategies WHERE id = ?").get(id) as StrategyRow) ?? null;
}

export function listStrategies(): StrategyRow[] {
  return must().prepare("SELECT * FROM strategies ORDER BY id DESC").all() as StrategyRow[];
}

export function updateStrategy(id: number, fields: Partial<StrategyRow>): StrategyRow | null {
  const allowed = new Set(["name", "mode", "auto", "interval_min", "budget",
    "stop_loss_pct", "take_profit_pct", "approval_mode", "live_unlocked", "active"]);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.has(k) || v === undefined) continue;
    sets.push(`${k} = ?`);
    vals.push(typeof v === "boolean" ? (v ? 1 : 0) : v);
  }
  if (sets.length) {
    must()
      .prepare(`UPDATE strategies SET ${sets.join(", ")} WHERE id = ?`)
      .run(...vals, id);
  }
  return getStrategy(id);
}

export function deleteStrategy(id: number): void {
  must().prepare("UPDATE orders SET strategy_id = NULL WHERE strategy_id = ?").run(id);
  must().prepare("DELETE FROM strategies WHERE id = ?").run(id);
}

export function autoStrategies(): StrategyRow[] {
  return must()
    .prepare("SELECT * FROM strategies WHERE auto = 1 AND active = 1")
    .all() as StrategyRow[];
}

/* ---------------- meetings ---------------- */

export function startMeeting(symbol: string, market: string, engine: string, strategyId?: number): number {
  const info = must()
    .prepare("INSERT INTO meetings (symbol, market, started_at, engine, strategy_id) VALUES (?, ?, ?, ?, ?)")
    .run(symbol, market, new Date().toISOString(), engine, strategyId ?? null);
  return Number(info.lastInsertRowid);
}

export function addTurn(meetingId: number, seq: number, t: Turn): void {
  must()
    .prepare(
      "INSERT INTO turns (meeting_id, seq, key, agent, mood, ts, content) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(meetingId, seq, t.key, t.agent, t.mood, t.ts, t.content);
}

export function finishMeeting(meetingId: number, action: string, confidence: number): void {
  must()
    .prepare("UPDATE meetings SET finished_at = ?, action = ?, confidence = ? WHERE id = ?")
    .run(new Date().toISOString(), action, confidence, meetingId);
}

export function recentMeetings(limit = 20) {
  return must().prepare("SELECT * FROM meetings ORDER BY id DESC LIMIT ?").all(limit);
}

export function getTurns(meetingId: number): Turn[] {
  const rows = must()
    .prepare("SELECT key, agent, mood, ts, content FROM turns WHERE meeting_id = ? ORDER BY seq")
    .all(meetingId) as Array<{ key: string; agent: string; mood: string; ts: string; content: string }>;
  return rows.map((r) => ({
    key: r.key,
    agent: r.agent,
    mood: r.mood as Turn["mood"],
    ts: r.ts,
    content: r.content,
  }));
}

/* ---------------- decisions & orders ---------------- */

export function saveDecision(meetingId: number, d: Decision, reasoning: string, strategyId?: number): number {
  const info = must()
    .prepare(
      "INSERT INTO decisions (meeting_id, strategy_id, symbol, action, confidence, reasoning, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(meetingId, strategyId ?? null, d.symbol, d.action, d.confidence, reasoning, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export interface OrderRow {
  id: number;
  decision_id: number | null;
  strategy_id: number | null;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  reason: string | null;
  broker: string | null;
  broker_order_id: string | null;
  created_at: string;
}

export function saveOrder(o: {
  decisionId?: number | null;
  strategyId?: number | null;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  reason?: string;
  broker?: string | null;
  brokerOrderId?: string | null;
}): number {
  const info = must()
    .prepare(
      "INSERT INTO orders (decision_id, strategy_id, symbol, side, quantity, price, status, reason, broker, broker_order_id, created_at)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      o.decisionId ?? null, o.strategyId ?? null, o.symbol, o.side, o.quantity,
      o.price, o.status, o.reason ?? "", o.broker ?? null, o.brokerOrderId ?? null,
      new Date().toISOString()
    );
  return Number(info.lastInsertRowid);
}

export function setOrderStatus(id: number, status: string, reason?: string, broker?: string, brokerOrderId?: string): void {
  must()
    .prepare("UPDATE orders SET status = ?, reason = COALESCE(?, reason), broker = COALESCE(?, broker), broker_order_id = COALESCE(?, broker_order_id) WHERE id = ?")
    .run(status, reason ?? null, broker ?? null, brokerOrderId ?? null, id);
}

export function pendingOrders(): OrderRow[] {
  return must().prepare("SELECT * FROM orders WHERE status = 'pending' ORDER BY id DESC").all() as OrderRow[];
}

export function getOrder(id: number): OrderRow | null {
  return (must().prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow) ?? null;
}

export function recentOrders(limit = 30): OrderRow[] {
  return must().prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ?").all(limit) as OrderRow[];
}

export function recentDecisions(limit = 20) {
  return must().prepare("SELECT * FROM decisions ORDER BY id DESC LIMIT ?").all(limit);
}

/* ---------------- portfolio (paper book) ---------------- */

export function cashBalance(): number {
  const row = must().prepare("SELECT balance FROM cash WHERE id = 1").get() as { balance: number };
  return row.balance;
}

export function adjustCash(delta: number): void {
  must().prepare("UPDATE cash SET balance = balance + ? WHERE id = 1").run(delta);
}

export function positions(): Record<string, { qty: number; avg: number }> {
  const rows = must()
    .prepare("SELECT symbol, side, quantity, price FROM orders WHERE status = 'filled' ORDER BY id")
    .all() as Array<{ symbol: string; side: string; quantity: number; price: number }>;
  const out: Record<string, { qty: number; avg: number }> = {};
  for (const r of rows) {
    const p = (out[r.symbol] ??= { qty: 0, avg: 0 });
    if (r.side === "BUY") {
      const prevQty = p.qty;
      p.qty += r.quantity;
      p.avg = prevQty + r.quantity > 0 ? (p.avg * prevQty + r.price * r.quantity) / (prevQty + r.quantity) : 0;
    } else {
      p.qty = Math.max(0, p.qty - r.quantity);
      if (p.qty === 0) p.avg = 0;
    }
  }
  return out;
}

/* ---------------- settings ---------------- */

export function getSetting(key: string, fallback: string): string {
  const row = must().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  must()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}
