/* Toss Securities OpenAPI broker (KRW equities, market orders).
 * Credentials are issued per user at tossinvest.com; the caller's public IP
 * must be whitelisted in the Toss console. */
import type { Balance, Broker, OrderResult } from "./types";
import { BrokerError } from "./types";
import { request, qs } from "./http";

const DEFAULT_BASE = "https://openapi.tossinvest.com";

export interface TossCreds {
  clientId: string;
  clientSecret: string;
  accountSeq: string;
  baseUrl?: string;
}

export class TossBroker implements Broker {
  readonly id = "toss";
  private token: string | null = null;
  private tokenExp = 0;

  constructor(private creds: TossCreds) {}

  private base(): string {
    return (this.creds.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  private async auth(): Promise<string> {
    if (this.token && Date.now() < this.tokenExp - 30_000) return this.token;
    const res = await request(`${this.base()}/oauth2/token`, {
      method: "POST",
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
      }),
    });
    if (res.status !== 200) throw new BrokerError("toss token failed", res.text.slice(0, 200));
    const data = res.json as { access_token?: string; token_type?: string; expires_in?: number };
    if (!data.access_token) throw new BrokerError("toss token missing");
    this.token = data.access_token;
    this.tokenExp = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.token;
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown, query?: Record<string, string>): Promise<Record<string, unknown>> {
    const token = await this.auth();
    const url = `${this.base()}${path}${query ? `?${qs(query)}` : ""}`;
    const res = await request(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) throw new BrokerError(`toss ${path} failed`, res.text.slice(0, 200));
    return (res.json ?? {}) as Record<string, unknown>;
  }

  async quote(symbol: string): Promise<number> {
    const data = await this.call("GET", "/v1/market/price", undefined, { symbol });
    for (const key of ["currentPrice", "current_price", "price", "lastPrice"]) {
      if (key in data) return Number(data[key]);
    }
    throw new BrokerError("toss price payload unexpected");
  }

  async balances(): Promise<Balance[]> {
    const data = await this.call("GET", `/v1/accounts/${this.creds.accountSeq}/balances`);
    const list = (data.balances ?? data) as unknown;
    if (!Array.isArray(list)) return [];
    return list.map((raw) => {
      const b = raw as Record<string, unknown>;
      return {
        asset: String(b.symbol ?? b.asset ?? b.name ?? "?"),
        free: Number(b.quantity ?? b.qty ?? 0),
        locked: 0,
      };
    });
  }

  async marketOrder(symbol: string, side: "BUY" | "SELL", quantity: number): Promise<OrderResult> {
    const data = await this.call("POST", `/v1/accounts/${this.creds.accountSeq}/orders`, {
      symbol,
      side,
      orderType: "MARKET",
      quantity: Math.floor(quantity), // KRW equities are whole-share orders
    });
    const orderId = String(data.orderId ?? data.order_id ?? "");
    return { brokerOrderId: orderId, status: "SUBMITTED", raw: data };
  }

  async ping(): Promise<string> {
    const bs = await this.balances();
    return `OK, ${bs.length} positions`;
  }
}
