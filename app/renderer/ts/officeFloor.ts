/* Top-down office floor plan — "real company" layout (v2).
 * Rooms (회의실/경영실), open workstations with readable furniture
 * (monitors, keyboards, chairs), reception, lounge, kitchen, zone labels.
 * Canvas 32x24 tiles @32px = 1024x768. Everything hand-drawn in code. */
import { charSprite, charColor, type CharDir } from "./icons";

export const T = 32;
export const COLS = 32;
export const ROWS = 24;

interface CharState {
  agent: string;
  x: number;
  y: number;
  dir: CharDir;
  speaking: boolean;
  bubble: string | null;
}

/* Legend: w wall · . floor. Furniture is placed by code (FURN list), not map chars. */
/* 단체회의 참석 멤버(리서치페+)와 회의실 의자 위치 */
const GROUP_MEMBERS = [
  "research_manager", "bull_researcher", "bear_researcher",
  "market_analyst", "news_analyst", "sentiment_analyst", "fundamentals_analyst",
] as const;
const SEATS_GROUP = new Set<string>(GROUP_MEMBERS);
/* 회의실 탈 좌표 (위 3 + 아래 3 + 좌 1) */
const GROUP_SPOTS = new Map<string, { x: number; y: number }>([
  ["research_manager",     { x: 5.5, y: 6.55 }],
  ["bull_researcher",      { x: 3.6, y: 6.55 }],
  ["bear_researcher",      { x: 7.4, y: 6.55 }],
  ["market_analyst",       { x: 3.6, y: 2.45 }],
  ["news_analyst",         { x: 5.5, y: 2.45 }],
  ["sentiment_analyst",    { x: 7.4, y: 2.45 }],
  ["fundamentals_analyst", { x: 8.65, y: 4.3 }],
]);

const MAP: string[] = [
  "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
  "w........w..........w..........w",
  "w........w..........w..........w",
  "w........w..........w..........w",
  "w........w..........w..........w",
  "w........w..........w..........w",
  "w........w..........w..........w",
  "wwww..wwww..........wwww..wwwwww",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "w..............................w",
  "wwwwwwwwwwwwwww..wwwwwwwwwwwwwww",
];

export interface Seat { x: number; y: number }
export const SEATS: Record<string, Seat> = {
  market_analyst:       { x: 4,  y: 11.15 },
  news_analyst:         { x: 7,  y: 11.15 },
  sentiment_analyst:    { x: 10, y: 11.15 },
  fundamentals_analyst: { x: 13, y: 11.15 },
  bull_researcher:      { x: 4,  y: 14.15 },
  bear_researcher:      { x: 7,  y: 14.15 },
  research_manager:     { x: 10, y: 14.15 },
  trader:               { x: 4,  y: 18.15 },
  risk_manager:         { x: 7,  y: 18.15 },
  portfolio_manager:    { x: 28, y: 4.35 },
};

const C = {
  floorA: "#f0e7cf", floorB: "#e9dfc4", floorLine: "#ddd2b4",
  wall: "#ece6d4", wallLight: "#f6f1e3", baseboard: "#b7b09a", wallEdge: "#c9c2ad",
  wood: "#b08a5c", woodDark: "#8e6c44", woodLine: "#9a7850",
  woodLite: "#c9a06a", woodTop: "#e0b985",
  screenOff: "#3c4450", screenOn: "#9fd48a", screenLine: "#6ea865",
  keyTop: "#d8d3c6", keyDot: "#b5b0a3",
  leaf: "#5a8a4e", leafLite: "#7aa866", leafDark: "#46703c",
  pot: "#c07850", potDark: "#9c5c3c",
  rugA: "#8fd0c4", rugB: "#6fb8aa", rugLine: "#5a9e92",
  metal: "#7a8494", steel: "#aab4bc",
  fridge: "#dde2e8", fridgeLine: "#aab2bc", fridgeDark: "#8e98a4",
  label: "#b3a88e",
};

/* Employee nicknames shown as name tags on the floor. */
const NICK: Record<string, string> = {
  market_analyst: "차민",
  news_analyst: "서아",
  sentiment_analyst: "도윤",
  fundamentals_analyst: "지호",
  bull_researcher: "하윤",
  bear_researcher: "은우",
  research_manager: "수빈",
  trader: "태오",
  risk_manager: "세라",
  portfolio_manager: "미르",
};

/* Department zones: each gets its own accent color, partition wall,
 * floor tint, and matching chair cushions / desk mugs. */
const DEPTS = [
  { key: "ANALYST",  color: "#3d7bff", dark: "#2b5cc4", tint: "rgba(61,123,255,.09)",  row: 10, xs: [3, 6, 9, 12] },
  { key: "RESEARCH", color: "#8b5cf6", dark: "#6d3fd1", tint: "rgba(139,92,246,.09)", row: 13, xs: [3, 6, 9] },
  { key: "TRADING",  color: "#1fae62", dark: "#158a4c", tint: "rgba(46,213,115,.10)", row: 17, xs: [3, 6], dual: true },
] as const;

function rc(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/* ---------- floor & wall ---------- */
function drawFloorTile(ctx: CanvasRenderingContext2D, px: number, py: number, alt: boolean): void {
  rc(ctx, px, py, T, T, alt ? C.floorB : C.floorA);
  ctx.fillStyle = C.floorLine;
  for (let i = 8; i < T; i += 8) {
    ctx.fillRect(px + i - 1, py, 1, T);
    ctx.fillRect(px, py + i - 1, T, 1);
  }
}

function drawWallTile(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  rc(ctx, px, py, T, T, C.wall);
  rc(ctx, px, py, T, 4, C.wallLight);
  rc(ctx, px, py + T - 6, T, 6, C.baseboard);
  rc(ctx, px, py + T - 2, T, 2, C.wallEdge);
}

/* ---------- furniture ---------- */
/** Office chair centered at (px,py), facing `dir`, optional cushion color. */
function drawChair(ctx: CanvasRenderingContext2D, px: number, py: number, dir: CharDir, cushion = "#c89a6a"): void {
  const x = Math.round(px), y = Math.round(py);
  ctx.fillStyle = C.woodDark;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
  rc(ctx, x - 7, y - 7, 14, 13, cushion);
  rc(ctx, x - 5, y - 5, 10, 9, lighten(cushion));
  if (dir === "up") rc(ctx, x - 9, y - 11, 18, 4, C.woodDark);
  else if (dir === "down") rc(ctx, x - 9, y + 6, 18, 4, C.woodDark);
  else if (dir === "left") rc(ctx, x - 11, y - 9, 4, 18, C.woodDark);
  else rc(ctx, x + 7, y - 9, 4, 18, C.woodDark);
}

/** Mix a hex color ~35% toward white (cheap cushion highlight). */
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (v: number) => Math.round(v + (255 - v) * 0.35);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/** Desk w tiles wide, 1 tall, facing down (person sits below). */
function drawDesk(ctx: CanvasRenderingContext2D, px: number, py: number, w: number, dual = false, mug = "#d46a5a"): void {
  const W = w * T;
  rc(ctx, px, py + 5, W, 21, C.wood);
  rc(ctx, px, py + 24, W, 5, C.woodDark);
  ctx.fillStyle = C.woodLine;
  ctx.fillRect(px + 2, py + 10, W - 4, 1);
  ctx.fillRect(px + 4, py + 18, W - 8, 1);
  rc(ctx, px + 2, py + 29, 4, 3, C.woodDark);
  rc(ctx, px + W - 6, py + 29, 4, 3, C.woodDark);
  // monitor(s) along the back edge
  const mon = (mx: number) => {
    rc(ctx, mx, py + 7, 24, 13, C.screenOff);
    rc(ctx, mx + 2, py + 9, 20, 4, C.screenOn);
    rc(ctx, mx + 2, py + 15, 12, 2, "#6ea865");
    rc(ctx, mx + 9, py + 2, 6, 5, C.screenOff); // stand
  };
  if (dual) { mon(px + 4); mon(px + W - 30); }
  else mon(px + W / 2 - 12);
  // keyboard + mouse
  const kx = dual ? px + W / 2 - 12 : px + W / 2 - 9;
  rc(ctx, kx, py + 21, 18, 5, C.keyTop);
  ctx.fillStyle = C.keyDot;
  for (let i = 0; i < 4; i++) ctx.fillRect(kx + 2 + i * 4, py + 23, 2, 1);
  rc(ctx, kx + 22, py + 22, 4, 4, "#e8e4d8");
  // mug + papers (mug takes the department accent color)
  rc(ctx, px + 4, py + 20, 5, 5, mug);
  rc(ctx, px + 9, py + 21, 2, 3, mug);
  rc(ctx, px + W - 14, py + 9, 8, 10, "#f4f0e4");
  ctx.fillStyle = C.keyDot;
  ctx.fillRect(px + W - 12, py + 12, 5, 1);
  ctx.fillRect(px + W - 12, py + 15, 4, 1);
}

/** Cubicle partition (low gray panel). */
function drawPartition(ctx: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, trim = ""): void {
  rc(ctx, px, py, w * T, h * T, "#c5beb0");
  rc(ctx, px, py, w * T, 2, trim || "#d8d2c4");
  rc(ctx, px, py + h * T - 2, w * T, 2, "#a8a094");
}

/** Department divider wall: taller fabric panel with colored top rail + end posts. */
function drawZoneWall(ctx: CanvasRenderingContext2D, px: number, py: number, w: number, color: string): void {
  const W = w * T, H = 15;
  rc(ctx, px, py, W, H, "#b9b3a6");                 // fabric panel
  ctx.fillStyle = "rgba(0,0,0,.06)";
  for (let i = 4; i < W - 4; i += 6) ctx.fillRect(px + i, py + 4, 2, H - 8); // weave texture
  rc(ctx, px, py, W, 4, color);                     // colored top rail
  rc(ctx, px, py + H - 3, W, 3, "#948e82");         // bottom shadow
  rc(ctx, px - 2, py - 3, 6, H + 6, "#9a948a");     // end posts
  rc(ctx, px + W - 4, py - 3, 6, H + 6, "#9a948a");
}

/** Soft colored floor tint marking a department zone. */
function drawZoneTint(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint: string): void {
  ctx.fillStyle = tint;
  ctx.beginPath(); ctx.roundRect(x * T + 2, y * T + 2, w * T - 4, h * T - 4, 10); ctx.fill();
}

/** Department badge: colored pill with white label. */
function drawZoneBadge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
  ctx.font = "700 12px -apple-system, 'Segoe UI', 'Noto Sans KR', sans-serif";
  const w = ctx.measureText(text).width + 18;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 12, w, 21, 10); ctx.fill();
  rc(ctx, x - w / 2, y + 6, w, 3, "rgba(0,0,0,.18)"); // pill shadow
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + 3);
}

function drawRoundTable(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = C.wood;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.woodDark; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0.6, 2.6); ctx.stroke();
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, px: number, py: number, w: number): void {
  const W = w * T;
  rc(ctx, px, py, W, 26, "#6a7484");
  rc(ctx, px + 2, py + 2, W - 4, 22, "#f8f6ee");
  // chart doodle
  ctx.fillStyle = "#4f8cff";
  ctx.fillRect(px + 8, py + 16, 3, 6);
  ctx.fillRect(px + 14, py + 12, 3, 10);
  ctx.fillRect(px + 20, py + 8, 3, 14);
  ctx.fillStyle = "#d46a5a";
  ctx.fillRect(px + 28, py + 10, 14, 2);
  ctx.fillRect(px + 28, py + 15, 10, 2);
  ctx.fillStyle = "#5aa878";
  ctx.fillRect(px + 46, py + 8, 12, 12);
  rc(ctx, px + 6, py + 24, W - 12, 2, "#8b98a9"); // marker tray
}

/* ---------- lounge / kitchen / misc ---------- */
function drawSofa(ctx: CanvasRenderingContext2D, px: number, py: number, w: number): void {
  const W = w * T;
  rc(ctx, px, py, W, 28, "#96664e");
  rc(ctx, px + 4, py + 4, W - 8, 20, "#b5836a");
  rc(ctx, px + W / 2 - 1, py + 6, 2, 16, "#a5755c");   // cushion seam
  rc(ctx, px, py, 5, 28, "#7e5540");                   // armrests
  rc(ctx, px + W - 5, py, 5, 28, "#7e5540");
  rc(ctx, px + 8, py + 8, 8, 8, "#c99a82");            // throw pillow
}

function drawCoffeeTable(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  rc(ctx, px, py, 30, 18, C.wood);
  rc(ctx, px, py + 14, 30, 4, C.woodDark);
  rc(ctx, px + 6, py + 4, 10, 7, "#f4f0e4");           // magazine
  rc(ctx, px + 8, py + 5, 6, 2, "#d46a5a");
}

function drawTV(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  rc(ctx, px, py, 56, 8, C.woodDark);                  // stand
  rc(ctx, px + 22, py - 4, 12, 4, C.screenOff);        // neck
  rc(ctx, px + 4, py - 30, 48, 27, "#222c36");
  rc(ctx, px + 7, py - 27, 42, 21, "#31404e");
  rc(ctx, px + 10, py - 24, 16, 8, "#3e5263");
}

function drawKitchenCounter(ctx: CanvasRenderingContext2D, px: number, py: number, h: number): void {
  const H = h * T;
  rc(ctx, px, py, 26, H, "#c8d0d8");                   // counter top
  rc(ctx, px + 26, py, 6, H, "#98a0a8");               // cabinet face
  // sink
  rc(ctx, px + 4, py + 14, 18, 14, "#9fb4c0");
  rc(ctx, px + 6, py + 16, 14, 10, "#c2d4de");
  rc(ctx, px + 11, py + 6, 4, 8, C.steel);             // faucet
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  rc(ctx, px, py, 14, 18, "#3c3a38");
  rc(ctx, px + 2, py + 2, 10, 5, "#26241f");
  ctx.fillStyle = "#ff6a4f";
  ctx.fillRect(px + 11, py + 9, 2, 2);                 // power LED
  rc(ctx, px + 4, py + 13, 6, 4, "#f4f0e4");           // cup
}

function drawFridge(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  rc(ctx, px + 3, py + 2, 24, 30, C.fridge);
  rc(ctx, px + 3, py + 2, 24, 3, C.fridgeDark);
  rc(ctx, px + 3, py + 14, 24, 2, C.fridgeLine);
  rc(ctx, px + 21, py + 5, 3, 6, C.fridgeDark);
  rc(ctx, px + 21, py + 18, 3, 6, C.fridgeDark);
}

function drawWaterCooler(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  rc(ctx, px, py + 8, 12, 16, "#eef0f2");
  rc(ctx, px + 2, py + 12, 8, 3, "#c8ccd0");
  ctx.fillStyle = "#4f8cff";
  ctx.beginPath(); ctx.arc(px + 6, py + 5, 5, 0, Math.PI * 2); ctx.fill();
}

function drawCopier(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  rc(ctx, px, py, 26, 30, "#cfc9bc");
  rc(ctx, px + 3, py + 3, 20, 10, "#e8e4d8");          // lid
  rc(ctx, px + 3, py + 20, 12, 7, "#b5b0a3");          // paper tray
  rc(ctx, px + 19, py + 21, 4, 5, "#f4f0e4");          // out tray
  ctx.fillStyle = "#2ea44f";
  ctx.fillRect(px + 21, py + 5, 2, 2);
}

function drawReceptionDesk(ctx: CanvasRenderingContext2D, px: number, py: number, w: number): void {
  const W = w * T;
  rc(ctx, px, py, W, 34, C.woodTop);
  rc(ctx, px, py + 26, W, 8, C.wood);
  ctx.fillStyle = C.woodLine;
  ctx.fillRect(px + 3, py + 10, W - 6, 1);
  // bell + monitor on counter
  ctx.fillStyle = "#e8c84a";
  ctx.beginPath(); ctx.arc(px + W - 12, py + 8, 4, 0, Math.PI * 2); ctx.fill();
  rc(ctx, px + 8, py - 10, 22, 12, C.screenOff);
  rc(ctx, px + 10, py - 8, 18, 4, C.screenOn);
}

function drawShelf(ctx: CanvasRenderingContext2D, px: number, py: number, w: number): void {
  const W = w * T;
  rc(ctx, px, py, W, 14, "#8e6c44");
  rc(ctx, px + 2, py + 2, W - 4, 10, "#a5835c");
  const cols = ["#d46a5a", "#5a7ab0", "#5aa878", "#e8c84a", "#b5836a"];
  for (let i = 0; i * 6 + 4 < W - 6; i++) {
    rc(ctx, px + 4 + i * 6, py + 3, 4, 8, cols[i % cols.length]);
  }
}

function drawPlant(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  rc(ctx, px + 10, py + 22, 12, 9, C.pot);
  rc(ctx, px + 11, py + 22, 10, 2, C.potDark);
  const leaf = (x: number, y: number, w: number, h: number, c: string) => rc(ctx, px + x, py + y, w, h, c);
  leaf(12, 2, 8, 6, C.leafLite);
  leaf(7, 6, 18, 9, C.leaf);
  leaf(5, 11, 22, 9, C.leaf);
  leaf(10, 9, 5, 6, C.leafLite);
  leaf(19, 13, 5, 5, C.leafDark);
  leaf(8, 17, 4, 4, C.leafDark);
}

function drawDoormat(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  rc(ctx, px, py, 64, 20, "#8a8272");
  rc(ctx, px + 3, py + 3, 58, 14, "#9a9280");
}

function drawRug(ctx: CanvasRenderingContext2D, px: number, py: number, w: number, h: number): void {
  const W = w * T, H = h * T;
  ctx.fillStyle = C.rugA;
  ctx.beginPath();
  ctx.roundRect(px, py, W, H, 8);
  ctx.fill();
  ctx.strokeStyle = C.rugB; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(px + 5, py + 5, W - 10, H - 10, 5); ctx.stroke();
  ctx.fillStyle = C.rugLine;
  ctx.fillRect(px + W / 2 - 8, py + H / 2 - 1, 16, 2);
}

export class OfficeFloor {
  private chars = new Map<string, CharState>();
  private target = new Map<string, { x: number; y: number } | null>();
  private raf = 0;
  private bubbles = new Map<string, HTMLDivElement>();
  private nextWander = new Map<string, number>();
  private breakUntil = new Map<string, number>();
  private breakKind = new Map<string, "walk" | "coffee" | "chat">();
  private chatWith = new Map<string, string>();
  private reportHold = new Map<string, number>();
  /** 자동 단체회의: 발화 턴이 아닌 리서치진도 회의실에 모이도록 유지 */
  private groupMeetingUntil = 0;

  constructor(private canvas: HTMLCanvasElement, private bubbleLayer?: HTMLDivElement) {
    canvas.width = COLS * T;
    canvas.height = ROWS * T;
    const now = performance.now();
    for (const [agent, seat] of Object.entries(SEATS)) {
      this.chars.set(agent, { agent, x: seat.x, y: seat.y, dir: "up", speaking: false, bubble: null });
      this.target.set(agent, null);
      this.nextWander.set(agent, now + 5000 + Math.random() * 10000);
    }
  }

  start(): void {
    if (this.raf) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      this.step(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  speak(agent: string, text: string | null): void {
    const c = this.chars.get(agent);
    if (!c) return;
    if (text) {
      if ((this.breakUntil.get(agent) ?? 0) > 0) this.endBreak(agent, performance.now()); // 휴식/대화 중이라면 정리하고 발언
      c.speaking = true;
      c.bubble = text;
      this.target.set(agent, null);
    } else {
      c.speaking = false;
      c.bubble = null;
      this.target.set(agent, null);
      this.nextWander.set(agent, performance.now() + 6000 + Math.random() * 12000);
    }
  }

  /* 발언 종료 시: 발언자 → 참석취소, 리서치진은 회의실 복귀,
   * PM 보고: trader/risk_manager가 경영실로 이동해 보고 */
  finishTurn(agent: string): void {
    const c = this.chars.get(agent);
    if (!c) return;
    if (agent === "portfolio_manager") {
      // PM은 경영실 자리로 복귀
      this.target.set(agent, null);
      return;
    }
    if (agent === "trader" || agent === "risk_manager") {
      // PM에게 보고하러 경장실(best)로 이동 (PM이 자리에 있을 때)
      const pm = this.chars.get("portfolio_manager");
      if (pm) {
        const side = agent === "trader" ? 0 : 1;
        this.target.set(agent, { x: pm.x - 1.1 + side * 2.2, y: pm.y + 0.15 });
        this.reportHold.set(agent, performance.now() + 6500);
        return;
      }
      return;
    }
    // 리서치진은 회의실 복귀, 분석가는 자리 복귀
    this.target.set(agent, null);
  }

  /* break spots kept on corridors/open floor */
  private static WALK_POINTS: Array<{ x: number; y: number }> = [
    { x: 16, y: 9.5 }, { x: 20, y: 9.5 }, { x: 25, y: 9.5 },
    { x: 16.5, y: 12 }, { x: 20.5, y: 15.5 }, { x: 24, y: 18 },
    { x: 26.5, y: 21.5 }, { x: 16.5, y: 22.4 }, { x: 10, y: 17.3 },
    { x: 3, y: 16.85 }, { x: 1.6, y: 13.2 }, { x: 21, y: 21.5 },
  ];

  /* coffee break spots (kitchen corner: coffee machine / round table / water cooler) */
  private static COFFEE_POINTS: Array<{ x: number; y: number }> = [
    { x: 28.6, y: 16.9 }, { x: 27.3, y: 17.4 }, { x: 28.3, y: 20.0 },
  ];

  /** Wrap up a break; if it was a chat, the partner leaves too. */
  private endBreak(agent: string, now: number): void {
    const partner = this.chatWith.get(agent);
    if (partner) {
      this.chatWith.delete(partner);
      this.breakKind.delete(partner);
      this.breakUntil.set(partner, now);
      this.target.set(partner, null);
    }
    this.chatWith.delete(agent);
    this.breakKind.delete(agent);
    this.breakUntil.set(agent, 0);
    this.target.set(agent, null);
    this.nextWander.set(agent, now + 5000 + Math.random() * 10000);
  }

  /** Pick an idle activity: 22% coffee, 23% chat with another idle agent, else a stroll. */
  private startBreak(agent: string, now: number): void {
    const roll = Math.random();
    if (roll < 0.18) {
      const pts = OfficeFloor.COFFEE_POINTS;
      const pick = pts[Math.floor(Math.random() * pts.length)];
      this.breakKind.set(agent, "coffee");
      this.target.set(agent, pick);
      this.breakUntil.set(agent, now + 6000 + Math.random() * 6000);
      return;
    }
    if (roll < 0.52) {
      const idle = [...this.chars.keys()].filter((a) =>
        a !== agent && !this.chars.get(a)!.speaking &&
        (this.breakUntil.get(a) ?? 0) === 0 && (this.chatWith.get(a) ?? "") === "");
      if (idle.length >= 1) {
        const a = agent, b = idle[Math.floor(Math.random() * idle.length)];
        const sa = SEATS[a], sb = SEATS[b];
        const meet = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 };
        const dx = sb.x - sa.x, dy = sb.y - sa.y;
        const off = Math.abs(dx) > Math.abs(dy) ? { x: 0, y: 0.9 } : { x: 0.9, y: 0 };
        const until = now + 9000 + Math.random() * 6000;
        for (const [who, spot] of [[a, { x: meet.x - off.x, y: meet.y - off.y }], [b, { x: meet.x + off.x, y: meet.y + off.y }]] as const) {
          this.breakKind.set(who, "chat");
          this.target.set(who, spot);
          this.breakUntil.set(who, until);
        }
        this.chatWith.set(a, b);
        this.chatWith.set(b, a);
        return;
      }
    }
    // default: leisurely stroll near the desk
    const pts = OfficeFloor.WALK_POINTS;
    const seat = SEATS[agent];
    const near = pts.filter((p) => Math.hypot(p.x - seat.x, p.y - seat.y) < 14);
    const pick = near.length ? near[Math.floor(Math.random() * near.length)] : pts[0];
    this.breakKind.set(agent, "walk");
    this.target.set(agent, pick);
    this.breakUntil.set(agent, now + 3000 + Math.random() * 5000);
  }

  private step(dt: number): void {
    const speed = 0.006 * dt;
    const now = performance.now();
    for (const [agent, c] of this.chars) {
      // 보고 중 trunk: 시간 지나면 리시트
      const hold = this.reportHold.get(agent);
      if (hold !== undefined && now >= hold) {
        this.reportHold.delete(agent);
        this.target.set(agent, null);
        this.nextWander.set(agent, now + 6000 + Math.random() * 10000);
      }
      // 단체회의 추적: 발화 턴이 아니어도 리서치진은 회의로 모임
      if (!c.speaking && now < this.groupMeetingUntil && (SEATS_GROUP.has(agent))
        && (this.breakUntil.get(agent) ?? 0) === 0 && !this.reportHold.has(agent)) {
        const gx = GROUP_SPOTS.get(agent);
        if (gx && Math.hypot(gx.x - c.x, gx.y - c.y) > 0.25) this.target.set(agent, gx);
      }
      const target = this.target.get(agent);
      if (target === null && !c.speaking) {
        const until = this.breakUntil.get(agent) ?? 0;
        if (until && now >= until) {
          this.endBreak(agent, now);
        } else if (!until && now >= (this.nextWander.get(agent) ?? 0)) {
          this.startBreak(agent, now);
        }
      }
      const seat = SEATS[agent];
      const dest = target ?? { x: seat.x, y: seat.y };
      const dx = dest.x - c.x, dy = dest.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.05) {
        const stepLen = Math.min(dist, speed);
        c.x += (dx / dist) * stepLen;
        c.y += (dy / dist) * stepLen;
        if (Math.abs(dx) > Math.abs(dy)) c.dir = dx > 0 ? "right" : "left";
        else c.dir = dy > 0 ? "down" : "up";
      } else {
        c.x = dest.x; c.y = dest.y;
      }
      // chatting agents face each other while paused
      if (this.breakKind.get(agent) === "chat") {
        const pc = this.chatWith.get(agent) ? this.chars.get(this.chatWith.get(agent)!) : null;
        if (pc) {
          c.dir = Math.abs(pc.x - c.x) > Math.abs(pc.y - c.y)
            ? (pc.x > c.x ? "right" : "left")
            : (pc.y > c.y ? "down" : "up");
        }
      }
    }
    // separation pass — keep agents from stacking on the same spot
    const list = [...this.chars.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = 0.75;
        if (d > 0.0001 && d < min) {
          const push = (min - d) / 2;
          const ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        } else if (d <= 0.0001) {
          a.x -= 0.06; b.x += 0.06;
        }
      }
    }
  }

  /** 발언 시작: 회의론이면 리시치진이 회의실로 모이고, 보고 주제면 떠득트 */
  beginMeetingPhase(agent: string, active: boolean): void {
    if (active) {
      this.groupMeetingUntil = performance.now() + 12000;
    } else {
      this.groupMeetingUntil = 0;
    }
  }

  private draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1) floor + walls
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = (MAP[y] ?? "").padEnd(COLS, ".")[x];
        const px = x * T, py = y * T;
        if (ch === "w") drawWallTile(ctx, px, py);
        else drawFloorTile(ctx, px, py, (x + y) % 2 === 0);
      }
    }

    // 2) meeting room (top-left)
    drawWhiteboard(ctx, 2.6 * T, 5, 5);
    drawChair(ctx, 3.6 * T, 2.45 * T, "down");
    drawChair(ctx, 5.5 * T, 2.45 * T, "down");
    drawChair(ctx, 7.4 * T, 2.45 * T, "down");
    drawChair(ctx, 3.6 * T, 6.15 * T, "up");
    drawChair(ctx, 5.5 * T, 6.15 * T, "up");
    drawChair(ctx, 7.4 * T, 6.15 * T, "up");
    drawChair(ctx, 2.35 * T, 4.3 * T, "right");
    drawChair(ctx, 8.65 * T, 4.3 * T, "left");
    ctx.fillStyle = C.wood;
    ctx.beginPath();
    ctx.ellipse(5.5 * T, 4.3 * T, 2.7 * T, 1.45 * T, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(5.5 * T, 4.3 * T, 1.8 * T, 0.85 * T, 0, 0.6, 2.5);
    ctx.stroke();
    // laptop + papers + cups on the table
    rc(ctx, 4.9 * T, 3.9 * T, 22, 14, C.screenOff);
    rc(ctx, 5.0 * T, 4.0 * T, 18, 4, C.screenOn);
    rc(ctx, 6.5 * T, 4.6 * T, 16, 10, "#f4f0e4");
    rc(ctx, 3.6 * T, 4.4 * T, 5, 5, "#d46a5a");
    rc(ctx, 7.2 * T, 3.6 * T, 5, 5, "#5a7ab0");
    drawPlant(ctx, 1.1 * T, 1.2 * T);

    // 3) executive office (top-right)
    drawDesk(ctx, 26 * T, 2 * T, 3);
    drawChair(ctx, 27.5 * T, 4.35 * T, "up");
    drawChair(ctx, 24.6 * T, 3.9 * T, "right");
    drawChair(ctx, 24.6 * T, 5.0 * T, "right");
    drawRoundTable(ctx, 22.8 * T, 3.4 * T, 14);
    drawChair(ctx, 21.9 * T, 3.4 * T, "right");
    drawChair(ctx, 23.7 * T, 2.6 * T, "down");
    drawShelf(ctx, 22.5 * T, 1.15 * T, 2);
    drawPlant(ctx, 21.2 * T, 1.3 * T);
    drawPlant(ctx, 29.2 * T, 1.3 * T);


    // 4) open plan — one colored zone per department, separated by divider walls
    for (const d of DEPTS) {
      const top = d.row - 1;
      drawZoneTint(ctx, 2.2, top + 0.2, d.xs[d.xs.length - 1] + 2.7 - 2.2, 3.2, d.tint);
      for (const dx of d.xs) {
        // per-desk side panels in the dept color
        drawPartition(ctx, dx * T - 4, (d.row - 0.9) * T, 0.16, 1.9, d.color);
        drawDesk(ctx, dx * T, d.row * T, 2, d.key === "TRADING", d.color);
        drawChair(ctx, (dx + 1) * T, (d.row + 1.3) * T, "up", d.color);
      }
    }
    // divider walls between zones (칸막이) — dept badges sit on them like signs
    drawZoneWall(ctx, 2.2 * T, 12.05 * T, 12.2, DEPTS[0].color);
    drawZoneWall(ctx, 2.2 * T, 15.85 * T, 9.2, DEPTS[1].color);
    drawZoneWall(ctx, 2.2 * T, 18.75 * T, 6.2, DEPTS[2].color);

    // 5) lounge (bottom-left)
    drawRug(ctx, 1.8 * T, 19.2 * T, 5.4, 2.6);
    drawSofa(ctx, 2 * T, 19.2 * T, 2);
    drawCoffeeTable(ctx, 5.4 * T, 20.2 * T);
    drawTV(ctx, 3.5 * T, 22.2 * T);
    drawPlant(ctx, 7.4 * T, 18.8 * T);

    // 6) reception (bottom-center, front door below)
    drawDoormat(ctx, 15 * T + 1, 22 * T + 8);
    drawReceptionDesk(ctx, 13.5 * T, 20.4 * T, 4);
    drawCopier(ctx, 19.2 * T, 21.2 * T);

    // 7) kitchen (right-bottom)
    drawKitchenCounter(ctx, 29.4 * T, 15 * T, 4);
    drawCoffeeMachine(ctx, 29.5 * T, 17.2 * T);
    drawFridge(ctx, 29.4 * T, 19.6 * T);
    drawWaterCooler(ctx, 28 * T, 20.6 * T);
    drawRoundTable(ctx, 26.8 * T, 18 * T, 16);
    drawChair(ctx, 25.9 * T, 18.3 * T, "right");
    drawChair(ctx, 27.7 * T, 17.7 * T, "left");

    // 8) misc: shelf along wall, plants, water cooler near desks
    drawShelf(ctx, 15 * T, 7 * T + 20, 2);
    drawPlant(ctx, 18.6 * T, 8.6 * T);
    drawPlant(ctx, 1.2 * T, 15.6 * T);
    drawPlant(ctx, 14.2 * T, 21.9 * T);
    drawWaterCooler(ctx, 14.9 * T, 12.4 * T);

    // 9) zone labels — dept badges sit on their divider walls, rooms get colored pills
    drawZoneBadge(ctx, 5.5 * T, 6.85 * T, "회의실", "#5a7ab0");
    drawZoneBadge(ctx, 24.5 * T, 6.5 * T, "경영실", "#9a8a5e");
    drawZoneBadge(ctx, 8.9 * T, 12.22 * T, "ANALYST", DEPTS[0].color);
    drawZoneBadge(ctx, 8.3 * T, 16.02 * T, "RESEARCH", DEPTS[1].color);
    drawZoneBadge(ctx, 5.3 * T, 18.92 * T, "TRADING", DEPTS[2].color);
    drawZoneBadge(ctx, 6.5 * T, 21.3 * T, "LOUNGE", "#3aa89a");
    drawZoneBadge(ctx, 28.4 * T, 14.45 * T, "KITCHEN", "#d0813a");
    drawZoneBadge(ctx, 15.5 * T, 19.95 * T, "RECEPTION", "#b8913a");

    // 10) characters painter-ordered
    const sorted = [...this.chars.values()].sort((a, b) => a.y - b.y);
    for (const c of sorted) this.drawChar(ctx, c);
    this.syncBubbles();
  }

  private drawChar(ctx: CanvasRenderingContext2D, c: CharState): void {
    const { rows } = charSprite(c.agent, c.dir);
    const px = Math.round(c.x * T - 18);       // 12x16 grid at 3px cells => 36x48
    const py = Math.round(c.y * T - 45);
    const cell = 3;
    rows.forEach((row, ry) => {
      row.split("").forEach((ch, rx) => {
        if (ch === ".") return;
        const color = charColor(ch);
        if (color === "transparent") return;
        ctx.fillStyle = color;
        ctx.fillRect(px + rx * cell, py + ry * cell, cell, cell);
      });
    });
    // name tag below feet, tinted per department
    const name = NICK[c.agent];
    if (name) {
      ctx.font = "700 10px -apple-system, 'Segoe UI', 'Noto Sans KR', sans-serif";
      const w = ctx.measureText(name).width + 10;
      const nx = Math.round(c.x * T - w / 2);
      const ny = Math.round(c.y * T + 8);
      ctx.fillStyle = "rgba(24,18,12,.6)";
      ctx.beginPath(); ctx.roundRect(nx, ny, w, 14, 7); ctx.fill();
      ctx.fillStyle = "#f4ead2";
      ctx.textAlign = "center";
      ctx.fillText(name, nx + w / 2, ny + 10.5);
    }
    // idle activity indicators
    const kind = this.breakKind.get(c.agent);
    if (kind === "chat" && this.chatWith.get(c.agent)) {
      // bouncing chatter dots above the head
      const t = performance.now() / 260;
      ctx.fillStyle = "#5a7ab0";
      for (let i = 0; i < 3; i++) {
        const yo = Math.abs(Math.sin(t + i * 0.9)) * 3;
        ctx.fillRect(px + 6 + i * 9, py - 10 - yo, 4, 4);
      }
    } else if (kind === "coffee") {
      // pixel cup with steam, held beside the head
      rc(ctx, px + 38, py + 4, 10, 9, "#fbf8ee");
      rc(ctx, px + 39, py + 5, 8, 3, "#8a5a34");
      rc(ctx, px + 48, py + 6, 3, 4, "#fbf8ee");
      rc(ctx, px + 40, py - 4, 2, 5, "rgba(200,190,170,.9)");
      rc(ctx, px + 44, py - 6, 2, 6, "rgba(200,190,170,.7)");
    }
  }

  /* Speech bubbles: DOM overlay anchored by % (crisp text at any zoom). */
  private syncBubbles(): void {
    const layer = this.bubbleLayer;
    if (!layer) return;
    for (const [agent, c] of this.chars) {
      const existing = this.bubbles.get(agent);
      if (!c.bubble) {
        if (existing) { existing.remove(); this.bubbles.delete(agent); }
        continue;
      }
      let el = existing;
      if (!el) {
        el = document.createElement("div");
        el.className = "obubble";
        layer.appendChild(el);
        this.bubbles.set(agent, el);
      }
      const text = c.bubble.length > 60 ? c.bubble.slice(0, 60) + "..." : c.bubble;
      if (el.textContent !== text) el.textContent = text;
      const px = c.x * T;
      const py = c.y * T - 46;
      el.style.left = `${(px / (COLS * T)) * 100}%`;
      el.style.top = `${((py - 8) / (ROWS * T)) * 100}%`;
    }
  }
}
