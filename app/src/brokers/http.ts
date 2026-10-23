/* Simple HTTP(S) JSON helper with timeout. */
import https from "node:https";
import http from "node:http";
import { BrokerError } from "./types";

const UA = "HiveDesk/0.2 (+trading desk)";

export function request(
  url: string,
  opts: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {}
): Promise<{ status: number; json: unknown; text: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(
      url,
      {
        method: opts.method ?? "GET",
        headers: {
          "User-Agent": UA,
          ...(opts.body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(opts.body) } : {}),
          ...opts.headers,
        },
        timeout: opts.timeoutMs ?? 15000,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          let json: unknown = null;
          try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
          resolve({ status: res.statusCode ?? 0, json, text });
        });
      }
    );
    req.on("timeout", () => req.destroy(new BrokerError("request timeout")));
    req.on("error", (e) => reject(new BrokerError("network error", String(e))));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

export function qs(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}
