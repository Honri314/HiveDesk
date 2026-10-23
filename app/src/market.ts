/* Market data: public endpoints only (Yahoo chart API for stocks, Binance
 * klines for crypto). Falls back to deterministic synthetic prices offline
 * so the app always demos. */
import http from "node:http";
import https from "node:https";
import type { Candle } from "./types";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) pixel-trading-floor/0.1";

function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      { headers: { "User-Agent": UA, Accept: "application/json" }, timeout: timeoutMs },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getJson(res.headers.location, timeoutMs).then(resolve, reject);
          res.resume();
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`bad json from ${url}`));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

const KR_TICKERS: Array<[string, string]> = [
  ["삼성전자", "005930.KS"],
  ["SK하이닉스", "000660.KS"],
  ["NAVER", "035420.KS"],
  ["카카오", "035720.KS"],
  ["현대차", "005380.KS"],
  ["LG에너지솔루션", "373220.KS"],
  ["셀트리온", "068270.KS"],
  ["삼성바이오로직스", "207940.KS"],
];
export function resolveTicker(input: string): string {
  const q = input.trim().toUpperCase();
  const kr = KR_TICKERS.find(([name]) => name.toUpperCase() === input.trim());
  if (kr) return kr[1];
  if (/^[0-9A-Z.]{1,16}$/.test(q)) return q;
  return "BTC-USD";
}
export function isCrypto(ticker: string): boolean {
  return /-USD$/.test(ticker.toUpperCase());
}
export function displayName(ticker: string): string {
  const found = KR_TICKERS.find(([, t]) => t === ticker);
  if (found) return found[0];
  return ticker;
}

interface YahooChart {
  chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> } }> };
}

export async function fetchCandles(input: string): Promise<{ candles: Candle[]; source: "yahoo" | "binance" | "synthetic"; symbol: string }> {
  const ticker = resolveTicker(input);
  try {
    if (isCrypto(ticker)) {
      const res = await getJson(
        `https://api.binance.com/api/v3/klines?symbol=${ticker.replace("-USD", "USDT")}&interval=1d&limit=60`
      ) as unknown as unknown[][];
      const candles: Candle[] = res.map((k) => ({
        t: Number(k[0]) / 1000, o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]),
      }));
      if (candles.length >= 30) return { candles, source: "binance", symbol: ticker };
      throw new Error("binance short");
    }
    const res = (await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=3mo&interval=1d`
    )) as YahooChart;
    const r = res.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (r?.timestamp && q?.close) {
      const candles: Candle[] = r.timestamp.map((t, i) => ({
        t, o: q.open?.[i] ?? q.close![i], h: q.high?.[i] ?? q.close![i],
        l: q.low?.[i] ?? q.close![i], c: q.close![i], v: q.volume?.[i] ?? 0,
      })).filter((c) => Number.isFinite(c.c) && c.c > 0);
      if (candles.length >= 30) return { candles, source: "yahoo", symbol: ticker };
    }
    throw new Error("yahoo empty");
  } catch {
    return { candles: synthetic(ticker), source: "synthetic", symbol: ticker };
  }
}

/* Deterministic pseudo-walk per ticker so offline demos are stable. */
function synthetic(ticker: string): Candle[] {
  let seed = 7;
  for (let i = 0; i < ticker.length; i++) seed = (seed * 31 + ticker.charCodeAt(i)) % 100000;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const base = isCrypto(ticker) ? 60000 + (seed % 40000) : 30000 + (seed % 900000) / 3;
  const out: Candle[] = [];
  let price = base;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 59; i >= 0; i--) {
    const o = price;
    price = Math.max(1, price * (1 + (rnd() - 0.48) * 0.03));
    const c = price;
    out.push({ t: now - i * 86400, o, h: Math.max(o, c) * 1.005, l: Math.min(o, c) * 0.995, c, v: 1000 + rnd() * 5000 });
  }
  return out;
}

/* ---------------- indicators ---------------- */

export function sma(closes: number[], n: number): number {
  if (closes.length < n) return closes.reduce((a, b) => a + b, 0) / closes.length;
  return closes.slice(-n).reduce((a, b) => a + b, 0) / n;
}

export function rsi(closes: number[], n = 14): number {
  if (closes.length < n + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / n / (loss / n);
  return 100 - 100 / (1 + rs);
}

export function macd(closes: number[]): { macd: number; signal: number } {
  const ema = (n: number) => {
    const k = 2 / (n + 1);
    let e = closes[0];
    for (let i = 1; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
    return e;
  };
  const m = ema(12) - ema(26);
  const sig = m * 0.9; // simplified signal line
  return { macd: m, signal: sig };
}

export interface Snapshot {
  symbol: string;
  name: string;
  source: string;
  last: number;
  ma10: number;
  ma30: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  candles: Candle[];
}

export function snapshot(input: string): Promise<Snapshot> {
  return fetchCandles(input).then(({ candles, source, symbol }) => {
    const closes = candles.map((c) => c.c);
    const data = macd(closes);
    return {
      symbol,
      name: displayName(symbol),
      source,
      last: closes[closes.length - 1] ?? 0,
      ma10: sma(closes, 10),
      ma30: sma(closes, 30),
      rsi14: rsi(closes, 14),
      macdLine: data.macd,
      macdSignal: data.signal,
      candles,
    };
  });
}

export function fmtPrice(v: number): string {
  if (v >= 100000) return Math.round(v).toLocaleString("ko-KR");
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}
