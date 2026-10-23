/* Binance spot broker (real orders). HMAC-SHA256 signed REST.
 * Testnet (testnet.binance.vision) is the default per rule 3. */
import crypto from "node:crypto";
import type { Balance, Broker, OrderResult } from "./types";
import { BrokerError } from "./types";
import { request, qs } from "./http";

const MAIN = "https://api.binance.com";
const TESTNET = "https://testnet.binance.vision";

export interface BinanceCreds {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

export function signQuery(params: Record<string, string | number>, secret: string): string {
  const query = qs(params);
  const sig = crypto.createHmac("sha256", secret).update(query).digest("hex");
  return `${query}&signature=${sig}`;
}

export class BinanceBroker implements Broker {
  readonly id = "binance";
  constructor(private creds: BinanceCreds) {}

  private base(): string {
    return this.creds.testnet ? TESTNET : MAIN;
  }

  private async signed(method: "GET" | "POST", path: string, params: Record<string, string | number> = {}): Promise<Record<string, unknown>> {
    const signed = signQuery(
      { ...params, timestamp: Date.now(), recvWindow: 5000 },
      this.creds.apiSecret
    );
    const res = await request(`${this.base()}${path}?${signed}`, {
      method,
      headers: { "X-MBX-APIKEY": this.creds.apiKey },
    });
    if (res.status !== 200) {
      throw new BrokerError(`binance ${path} failed`, res.text.slice(0, 200));
    }
    return res.json as Record<string, unknown>;
  }

  async quote(symbol: string): Promise<number> {
    const res = await request(`${MAIN}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
    if (res.status !== 200) throw new BrokerError("binance price failed", res.text.slice(0, 120));
    return Number((res.json as { price: string }).price);
  }

  async balances(): Promise<Balance[]> {
    const data = await this.signed("GET", "/api/v3/account");
    const list = (data.balances as Array<{ asset: string; free: string; locked: string }>) ?? [];
    return list
      .map((b) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked) }))
      .filter((b) => b.free + b.locked > 0);
  }

  async marketOrder(symbol: string, side: "BUY" | "SELL", quantity: number): Promise<OrderResult> {
    const q = Number(quantity.toFixed(6));
    const data = await this.signed("POST", "/api/v3/order", {
      symbol,
      side,
      type: "MARKET",
      quantity: q,
    });
    const status = String(data.status ?? "NEW");
    return {
      brokerOrderId: String(data.orderId ?? ""),
      status: status === "FILLED" ? "FILLED" : "SUBMITTED",
      raw: data,
    };
  }

  async ping(): Promise<string> {
    const bs = await this.balances();
    return this.creds.testnet ? `testnet OK, ${bs.length} assets` : `OK, ${bs.length} assets`;
  }
}
