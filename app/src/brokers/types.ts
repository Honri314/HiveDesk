/* Broker abstraction. Main-process only (rule 2). */

export interface Balance {
  asset: string;
  free: number;
  locked: number;
}

export interface OrderResult {
  brokerOrderId: string;
  status: "FILLED" | "SUBMITTED" | "REJECTED";
  fillPrice?: number;
  raw?: unknown;
}

export interface Broker {
  readonly id: string; // paper | binance | toss
  quote(symbol: string): Promise<number>;
  balances(): Promise<Balance[]>;
  marketOrder(symbol: string, side: "BUY" | "SELL", quantity: number): Promise<OrderResult>;
}

export class BrokerError extends Error {
  constructor(message: string, public readonly detail?: string) {
    super(message);
  }
}
