import { contextBridge, ipcRenderer } from "electron";

const api = {
  claudeStatus: () => ipcRenderer.invoke("claude:status"),
  marketResolve: (input: string) => ipcRenderer.invoke("market:resolve", input),
  marketSnapshot: (input: string) => ipcRenderer.invoke("market:snapshot", input),
  meetingRun: (input: string, strategyId?: number) => ipcRenderer.invoke("meeting:run", { input, strategyId }),
  meetingGet: (id: number) => ipcRenderer.invoke("meeting:get", id),
  meetingList: () => ipcRenderer.invoke("meeting:list"),
  portfolioGet: () => ipcRenderer.invoke("portfolio:get"),
  settingsGet: (key: string) => ipcRenderer.invoke("settings:get", key),
  settingsSet: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),

  /* strategies */
  strategyList: () => ipcRenderer.invoke("strategy:list"),
  strategyCreate: (data: Record<string, unknown>) => ipcRenderer.invoke("strategy:create", data),
  strategyUpdate: (id: number, fields: Record<string, unknown>) => ipcRenderer.invoke("strategy:update", id, fields),
  strategyDelete: (id: number) => ipcRenderer.invoke("strategy:delete", id),

  /* scheduler */
  schedulerStatus: () => ipcRenderer.invoke("scheduler:status"),
  schedulerReload: () => ipcRenderer.invoke("scheduler:reload"),
  schedulerRunNow: (id: number) => ipcRenderer.invoke("scheduler:runNow", id),

  /* orders & approval */
  ordersPending: () => ipcRenderer.invoke("orders:pending"),
  orderApprove: (orderId: number) => ipcRenderer.invoke("order:approve", orderId),
  orderReject: (orderId: number, reason?: string) => ipcRenderer.invoke("order:reject", orderId, reason),

  /* brokers & vault */
  brokerStatus: () => ipcRenderer.invoke("broker:status"),
  brokerQuote: (brokerId: string, symbol: string) => ipcRenderer.invoke("broker:quote", brokerId, symbol),
  brokerBalances: (brokerId: string) => ipcRenderer.invoke("broker:balances", brokerId),
  vaultSave: (key: string, value: string) => ipcRenderer.invoke("vault:save", key, value),
  vaultClear: (key: string) => ipcRenderer.invoke("vault:clear", key),
  killswitchGet: () => ipcRenderer.invoke("killswitch:get"),
  killswitchSet: (on: boolean) => ipcRenderer.invoke("killswitch:set", on),

  /* auto update */
  onUpdateStatus: (cb: (s: { event: string; version?: string }) => void) => {
    ipcRenderer.on("update:status", (_e, s) => cb(s));
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
