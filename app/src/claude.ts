/* Claude integration layer.
 *
 * Login model (rule 3): agents run through the official Claude Agent SDK,
 * which spawns the local `claude` CLI and uses the user's Claude subscription
 * session (OAuth profile in ~/.claude). We never collect passwords or keys.
 * Missing CLI / not logged in -> setup hint UI; auth failures -> demo fallback.
 */
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/* The SDK ships ESM-only (sdk.mjs). Loaded lazily so the demo pipeline and
 * every non-Claude code path run fine even if the loader refuses ESM. */
let queryFn: ((opts: unknown) => AsyncIterable<SDKMessage>) | null = null;
async function loadQuery(): Promise<(opts: unknown) => AsyncIterable<SDKMessage>> {
  if (queryFn) return queryFn;
  const mod = await import("@anthropic-ai/claude-agent-sdk");
  const q = (mod as unknown as { query?: typeof queryFn }).query;
  if (!q) throw new Error("claude-agent-sdk query missing");
  queryFn = q as (opts: unknown) => AsyncIterable<SDKMessage>;
  return queryFn;
}

export interface ClaudeStatus {
  cli: boolean;          // claude binary found
  loggedIn: boolean;     // subscription profile present (best effort)
  email: string | null;  // account shown on the settings card
  hint: string;          // next-step hint for the UI
}

let cached: ClaudeStatus | null = null;
let cachedAt = 0;

function findCli(): string | null {
  const dirs = process.env.PATH?.split(":") ?? [];
  for (const dir of dirs) {
    const p = join(dir, "claude");
    try { accessSync(p, constants.X_OK); return p; } catch { /* keep looking */ }
  }
  for (const extra of [join(homedir(), ".local", "bin", "claude"), "/usr/local/bin/claude"]) {
    try { accessSync(extra, constants.X_OK); return extra; } catch { /* keep looking */ }
  }
  return null;
}

/** macOS stores the OAuth session inside ~/.claude (file or Keychain). */
function profilePresent(): boolean {
  const base = join(homedir(), ".claude");
  if (existsSync(join(base, ".credentials.json"))) return true;
  try {
    const cfg = join(homedir(), ".claude.json");
    if (!existsSync(cfg)) return false;
    const j = JSON.parse(readFileSync(cfg, "utf8")) as { oauthAccount?: { email?: string } | null };
    return !!j.oauthAccount?.email;
  } catch {
    return false;
  }
}

export async function claudeStatus(): Promise<ClaudeStatus> {
  if (cached && Date.now() - cachedAt < 10_000) return cached;
  const cli = findCli();
  let ok = false;
  if (cli) {
    try {
      await new Promise<void>((resolve) => {
        execFile(cli, ["--version"], { timeout: 8000 }, () => resolve());
      });
      ok = true;
    } catch { ok = false; }
  }
  const email: string | null = (() => {
    try {
      const cfg = join(homedir(), ".claude.json");
      if (!existsSync(cfg)) return null;
      const j = JSON.parse(readFileSync(cfg, "utf8")) as { oauthAccount?: { email?: string } | null };
      return j.oauthAccount?.email ?? null;
    } catch { return null; }
  })();
  const loggedIn = ok && profilePresent();
  const status: ClaudeStatus = cli
    ? loggedIn
      ? { cli: true, loggedIn: true, email, hint: email ? `Claude 구독 연동 완료 (${email})` : "Claude 구독 연동 완료" }
      : { cli: true, loggedIn: false, email, hint: "터미널에서 `claude`를 한번 실행해 계정 로그인을 마친 뒤 앱을 다시 확인하세요" }
    : { cli: false, loggedIn: false, email, hint: "`npm install -g @anthropic-ai/claude-code` 설치 후 `claude` 로그인 (구독 계정 사용)" };
  cached = status;
  cachedAt = Date.now();
  return status;
}

/** Run one agent turn through the SDK (uses the subscription account). */
export async function runClaude(opts: { system: string; prompt: string; maxTurns?: number }): Promise<string> {
  const query = await loadQuery();
  if (!query) throw new Error("SDK query missing");
  let text = "";
  for await (const message of query({
    prompt: opts.prompt,
    options: {
      systemPrompt: opts.system,
      maxTurns: opts.maxTurns ?? 1,
      permissionMode: "plan",
      allowedTools: [],
      disallowedTools: ["Bash", "Edit", "Write", "NotebookEdit", "WebSearch", "WebFetch"],
      model: "sonnet",
      cwd: homedir(),
      pathToClaudeCodeExecutable: findCli() ?? undefined,
      strictMcpConfig: true,
      mcpServers: {},
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") text += block.text;
      }
    }
  }
  const trimmed = text.trim();
  cached = null;
  if (!trimmed) throw new Error("claude returned empty output");
  return trimmed;
}
