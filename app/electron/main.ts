/* Electron main process.
 * Owns: BrowserWindow, SQLite store, market fetch, Claude status, pipeline runs,
 * broker execution, scheduler. Renderer never touches these directly —
 * everything goes through the IPC bridge.
 */
import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { join } from "node:path";
import { initDb, startMeeting, addTurn, finishMeeting, saveDecision,
         recentMeetings, getTurns, recentOrders, recentDecisions,
         cashBalance, positions, getSetting, setSetting,
         getStrategy, createStrategy, updateStrategy, deleteStrategy,
         listStrategies, pendingOrders, type StrategyRow } from "../src/store";
import { claudeStatus } from "../src/claude";
import { runPipeline } from "../src/pipeline";
import { snapshot, resolveTicker, displayName, type Snapshot } from "../src/market";
import { setVaultCrypto, safeStorageCrypto, saveSecret, clearSecret } from "../src/vault";
import { execute, submitReal, approveOrder, rejectOrder, brokerStatus,
         resolveBroker, realTradingEnabled } from "../src/executor";
import * as scheduler from "../src/scheduler";
import type { Action, Turn } from "../src/types";

/* ------------------------- auto update ------------------------- */
/* 서버: https://ubuntu.tail543772.ts.net/hivedesk/release/latest.yml
 * DMG/EXE 다운로드 후 자동 설치. 개발 모드(npm start)에서는 비활성. */
const UPDATE_FEED = "https://ubuntu.tail543772.ts.net/hivedesk/release";
const isDev = !app.isPackaged;

const appDir: string = __filename.slice(0, __filename.lastIndexOf("/")) || ".";

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#efe9db",
    autoHideMenuBar: true,
    webPreferences: { preload: join(appDir, "preload.js") },
  });
  win.loadFile(join(appDir, "../renderer/index.html"));

  /* UI verification helper: HIVEDESK_SHOT=/path.png captures the loaded page
   * and exits. Used for automated screenshot checks. */
  const shotPath = process.env.HIVEDESK_SHOT;
  if (shotPath) {
    win.webContents.once("did-finish-load", () => {
      const tab = process.env.HIVEDESK_TAB;
      if (tab) {
        win!.webContents.executeJavaScript(
          `document.querySelector('.tab-btn[data-tab="${tab}"]')?.click()`
        ).catch(() => undefined);
      }
      if (process.env.HIVEDESK_RUN) {
        win!.webContents.executeJavaScript(
          `document.querySelector('#run-btn')?.click()`
        ).catch(() => undefined);
      }
      if (process.env.HIVEDESK_SCROLL_TOP) {
        win!.webContents.executeJavaScript(
          `window.scrollTo(0,0); document.querySelector('.tab.active')?.scrollTo(0,0);`
        ).catch(() => undefined);
      }
      const scrollTopBeforeShot = process.env.HIVEDESK_SCROLL_TOP;
      const pauseBeforeShot = process.env.HIVEDESK_PAUSE;
      void pauseBeforeShot;
      setTimeout(() => {
        if (!win) return;
        if (process.env.HIVEDESK_DEBUG) {
          win.webContents.executeJavaScript(
            `(() => { const c = document.querySelector('.stcard b'); const cs = c ? getComputedStyle(c) : null; const st = document.querySelector('.stcard'); const ss = st ? getComputedStyle(st) : null; return JSON.stringify({ text: c?.textContent, color: cs?.color, fontSize: cs?.fontSize, display: ss?.display, height: st?.getBoundingClientRect().height, width: st?.getBoundingClientRect().width }); })()`
          ).then((s) => console.log("[debug] status-strip:", s)).catch((e) => console.error("[debug]", e));
        }
        const prep: string[] = [];
        if (pauseBeforeShot) prep.push(`document.querySelector('#play-btn')?.click()`);
        if (scrollTopBeforeShot) prep.push(`window.scrollTo(0,0); document.querySelector('.tab.active')?.scrollTo(0,0);`);
        const doCapture = () => win!.webContents.capturePage().then((img) => {
          require("node:fs").writeFileSync(shotPath, img.toPNG());
          console.log(`[shot] saved ${shotPath}`);
          app.quit();
        }).catch((e) => { console.error("[shot] failed", e); app.quit(); });
        Promise.all(prep.map((js) => win!.webContents.executeJavaScript(js).catch(() => undefined)))
          .then(() => new Promise((r) => setTimeout(r, 400)))
          .then(doCapture);
      }, Number(process.env.HIVEDESK_SHOT_DELAY ?? 2500));
    });
  }
}

app.whenReady().then(() => {
  initDb(app.getPath("userData"));
  setVaultCrypto(safeStorageCrypto(safeStorage));
  scheduler.reload();
  createWindow();

  startAutoUpdate();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function startAutoUpdate(): Promise<void> {
  try {
    const { autoUpdater } = await import("electron-updater");
    autoUpdater.setFeedURL({ provider: "generic", url: UPDATE_FEED });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("update-downloaded", (info) => {
      console.log(`[updater] downloaded ${info.version} — 앱 종료 후 자동 설치`);
      win?.webContents.send("update:status", { event: "downloaded", version: info.version });
    });
    autoUpdater.on("update-available", (info) => {
      console.log(`[updater] available ${info.version}`);
      win?.webContents.send("update:status", { event: "available", version: info.version });
    });
    autoUpdater.on("download-progress", (p) => {
      if ((p.percent | 0) % 50 === 0) console.log(`[updater] progress ${p.percent | 0}%`);
    });
    autoUpdater.on("error", (e) => {
      console.warn("[updater] error", e?.message); // 네트워크 오류는 조용히 재시도 없이 무시
    });
    if (!isDev) {
      // 30초 후 1회 + 6시간 간격 재확인
      setTimeout(() => { void autoUpdater.checkForUpdates(); }, 30_000);
      setInterval(() => { void autoUpdater.checkForUpdates(); }, 6 * 60 * 60 * 1000);
    }
  } catch (e) {
    console.warn("[updater] not available", e);
  }
}

/* ------------------------- IPC: claude connection ------------------------- */

ipcMain.handle("claude:status", async () => {
  const s = await claudeStatus();
  return s;
});

/* ------------------------- IPC: market ------------------------- */

ipcMain.handle("market:resolve", (_e, input: string) => ({
  ticker: resolveTicker(input),
  name: displayName(resolveTicker(input)),
}));

ipcMain.handle("market:snapshot", async (_e, input: string) => {
  return snapshot(input);
});

/* ------------------------- IPC: meetings ------------------------- */

export interface RunOutcome {
  meetingId: number;
  turns: Turn[];
  action: Action;
  confidence: number;
  reasoning: string;
  engine: string;
  degraded: string | null;
  order: { id: number; status: string; reason: string; quantity: number; price: number } | null;
}

interface RunInput { input: string; strategyId?: number }

ipcMain.handle("meeting:run", async (_e, arg: RunInput | string): Promise<RunOutcome> => {
  const { input, strategyId } = typeof arg === "string" ? { input: arg, strategyId: undefined } : arg;
  const strategy = strategyId ? getStrategy(strategyId) : null;
  const symbol = strategy?.symbol ?? input;
  const snap: Snapshot = await snapshot(symbol);
  const cash = cashBalance();
  const result = await runPipeline(snap, cash);

  const engine = result.engine;
  const meetingId = startMeeting(snap.symbol, strategy?.market ?? marketOf(snap.symbol), engine, strategy?.id);
  result.turns.forEach((t, i) => addTurn(meetingId, i, t));
  finishMeeting(meetingId, result.action, result.confidence);
  const decisionId = saveDecision(meetingId, {
    action: result.action, confidence: result.confidence, symbol: snap.symbol, order: result.order,
  }, result.reasoning, strategy?.id);

  const outcome = await execute({
    strategyId: strategy?.id ?? null,
    decisionId,
    plan: result.order,
    action: result.action,
    confidence: result.confidence,
    source: "manual",
  });

  return {
    meetingId, turns: result.turns, action: result.action, confidence: result.confidence,
    reasoning: result.reasoning, engine, degraded: result.degraded,
    order: result.order
      ? { id: decisionId, status: outcome.status, reason: outcome.reason, quantity: result.order.quantity, price: result.order.price }
      : null,
  };
});

function marketOf(symbol: string): string {
  if (/\.KS$|\.KQ$/i.test(symbol)) return "kr_stock";
  return "crypto";
}

ipcMain.handle("meeting:get", (_e, id: number) => {
  const meetings = recentMeetings(100) as Array<Record<string, unknown>>;
  const m = meetings.find((x) => x.id === id);
  return m ? { ...m, turns: getTurns(id) } : null;
});

ipcMain.handle("meeting:list", () => recentMeetings(20));

/* ------------------------- IPC: portfolio ------------------------- */

ipcMain.handle("portfolio:get", () => {
  const pos = positions();
  return {
    cash: cashBalance(),
    positions: pos,
    orders: recentOrders(50),
    decisions: recentDecisions(20),
  };
});

/* ------------------------- IPC: settings ------------------------- */

ipcMain.handle("settings:get", (_e, key: string) => getSetting(key, ""));
ipcMain.handle("settings:set", (_e, key: string, value: string) => setSetting(key, value));

/* ------------------------- IPC: strategies ------------------------- */

ipcMain.handle("strategy:list", () => listStrategies());

ipcMain.handle("strategy:create", (_e, data: Partial<StrategyRow> & { name: string; symbol: string }) => {
  const s = createStrategy(data);
  scheduler.reload();
  return s;
});

ipcMain.handle("strategy:update", (_e, id: number, fields: Partial<StrategyRow>) => {
  const s = updateStrategy(id, fields);
  scheduler.reload();
  return s;
});

ipcMain.handle("strategy:delete", (_e, id: number) => {
  scheduler.stop(id);
  deleteStrategy(id);
  return true;
});

/* ------------------------- IPC: scheduler ------------------------- */

ipcMain.handle("scheduler:status", () => scheduler.status());

ipcMain.handle("scheduler:reload", () => scheduler.reload());

ipcMain.handle("scheduler:runNow", async (_e, id: number) => {
  return scheduler.runNow(id);
});

/* ------------------------- IPC: orders & approval ------------------------- */

ipcMain.handle("orders:pending", () => pendingOrders());

ipcMain.handle("order:approve", async (_e, orderId: number) => {
  return approveOrder(orderId);
});

ipcMain.handle("order:reject", (_e, orderId: number, reason?: string) => {
  rejectOrder(orderId, reason ?? "");
  return true;
});

/* ------------------------- IPC: brokers & vault ------------------------- */

ipcMain.handle("broker:status", () => brokerStatus());

ipcMain.handle("broker:quote", async (_e, brokerId: string, symbol: string) => {
  const strategy = { id: 0, name: "adhoc", symbol, market: brokerId === "toss" ? "kr_stock" : "crypto",
    mode: "real", auto: 0, interval_min: 30, budget: 0, stop_loss_pct: 0, take_profit_pct: 0,
    approval_mode: "manual", live_unlocked: 1, active: 1, created_at: "" } as StrategyRow;
  const broker = resolveBroker(strategy);
  return broker.quote(symbol);
});

ipcMain.handle("broker:balances", async (_e, brokerId: string) => {
  const strategy = { id: 0, name: "adhoc", symbol: "", market: brokerId === "toss" ? "kr_stock" : "crypto",
    mode: "real", auto: 0, interval_min: 30, budget: 0, stop_loss_pct: 0, take_profit_pct: 0,
    approval_mode: "manual", live_unlocked: 1, active: 1, created_at: "" } as StrategyRow;
  const broker = resolveBroker(strategy);
  return broker.balances();
});

ipcMain.handle("vault:save", (_e, key: string, value: string) => {
  saveSecret(key, value);
  return true;
});

ipcMain.handle("vault:clear", (_e, key: string) => {
  clearSecret(key);
  return true;
});

/* Kill switch toggle lives in settings; convenience wrappers keep the
 * renderer from hard-coding the key names. */
ipcMain.handle("killswitch:get", () => realTradingEnabled());

ipcMain.handle("killswitch:set", (_e, on: boolean) => {
  setSetting("real_trading_enabled", on ? "1" : "0");
  return realTradingEnabled();
});
