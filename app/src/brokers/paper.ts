/* Paper broker — fills instantly at the live snapshot price. */
import type { Balance, Broker, OrderResult } from "./types";
import { snapshot } from "../market";

export class PaperBroker implements Broker {
  readonly id = "paper";

  async quote(symbol: string): Promise<number> {
    const s = await snapshot(symbol);
    return s.last;
  }

  async balances(): Promise<Balance[]> {
    return []; // virtual balances are tracked in the store
  }

  async marketOrder(symbol: string, side: "BUY" | "SELL", quantity: number): Promise<OrderResult> {
    const s = await snapshot(symbol);
    return {
      brokerOrderId: `paper-${Date.now()}`,
      status: "FILLED",
      fillPrice: s.last,
      raw: { symbol, side, quantity, source: s.source },
    };
  }
}
