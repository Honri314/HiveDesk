/* Self-made pixel icon set — no emoji (rule 4).
 * Each icon is a 12x12 grid; '1' = filled pixel. Rendered on canvas at 3px/px.
 *
 * Also hosts the top-down office floor plan tiles (rule 4: everything
 * hand-drawn, no external image assets).
 */

/* top-down office tile sprites (16x16 grid, hand-drawn). Canvas rendering is elsewhere. */
export type TileId =
  | "floor" | "wall" | "wallTop" | "desk" | "monitor" | "plant" | "rug" | "window"
  | "kitchen" | "fridge";

export interface TileSprite { rows: string[] }

const TILE_COLORS: Record<string, string> = {
  ".": "transparent",
  W: "#eee9db", // wall cream
  w: "#d8d3c2", // wall shade
  F: "#c9b99a", // floor wood
  f: "#f0e7cf", // floor grid tile
  D: "#b08a5c", // desk wood
  d: "#8e6c44", // desk shade
  M: "#5a6472", // monitor frame
  m: "#9fd48a", // monitor screen on
  P: "#5a8a4e", // plant dark leaf
  p: "#7aa866", // plant light leaf
  V: "#b08a5c", // pot terracotta
  R: "#cdd5dc", // rug light
  r: "#aeb8c2", // rug line
  g: "#cfe4ee", // glass
  G: "#7aa8c2", // glass shade
  K: "#889098", // kitchen counter
  k: "#c8d0d8", // kitchen surface
  B: "#40403a", // outline
};

/* 8x8 mini-tiles drawn with chars above; scaled up when used. */
export const TILE_SPRITES: Record<TileId, TileSprite> = {
  floor: { rows: [
    "ffffffff",
    "ffffffff",
    "ffffffff",
    "ffffffff",
    "ffffffff",
    "ffffffff",
    "ffffffff",
    "ffffffff",
  ] },
  wall: { rows: [
    "BWWWWWWB",
    "BWWWWWWB",
    "BWWWWWWB",
    "BWWWWWWB",
    "BWWWWWWB",
    "BWWWWWWB",
    "BwwwwwwB",
    "BwwwwwwB",
  ] },
  wallTop: { rows: [
    "BWWWWWWB",
    "wwwwwwww",
    "wwwwwwww",
    "wwwwwwww",
    "wwwwwwww",
    "wwwwwwww",
    "wwwwwwww",
    "wwwwwwww",
  ] },
  desk: { rows: [
    "DDDDDDDD",
    "DDDDDDDD",
    "DDDDDDDD",
    "DDDDDDDD",
    "dddddddd",
    "dddddddd",
    "dddddddd",
    "dddddddd",
  ] },
  monitor: { rows: [
    "RRRRRRRR",
    "RmmmmmmR",
    "RmmmmmmR",
    "RmmmmmmR",
    "RmmmmmmR",
    "RRRRRRRR",
    "dddddddd",
    "dddddddd",
  ] },
  plant: { rows: [
    "........",
    "..pppp..",
    ".ppPPpp.",
    ".pPPPPp.",
    ".pPPPPp.",
    "..pPPp..",
    ".VVVVVV.",
    ".VVVVVV.",
  ] },
  rug: { rows: [
    "RRRRRRRR",
    "RrrrrrrR",
    "RrrrrrrR",
    "RrrrrrrR",
    "RrrrrrrR",
    "RrrrrrrR",
    "RrrrrrrR",
    "RRRRRRRR",
  ] },
  window: { rows: [
    "WWWWWWWW",
    "WggggggW",
    "WgGGGggW",
    "WggggggW",
    "WggggggW",
    "WggggggW",
    "WggggggW",
    "WWWWWWWW",
  ] },
  kitchen: { rows: [
    "KKKKKKKK",
    "KkkkkkkK",
    "KkkkkkkK",
    "KkkkkkkK",
    "KkkkkkkK",
    "KkkkkkkK",
    "KKKKKKKK",
    "KKKKKKKK",
  ] },
  fridge: { rows: [
    "WWWWWWWW",
    "WWWWWWWW",
    "WWwwwwWW",
    "WWwwwwWW",
    "WWwwwwWW",
    "WWwwwwWW",
    "WWwwwwWW",
    "WWwwwwWW",
  ] },
};

export function tileColor(ch: string): string {
  return TILE_COLORS[ch] ?? "transparent";
}

/* top-down character sprites (8x10, facing down/up/left/right) */
export type CharDir = "down" | "up" | "left" | "right";

const CHAR_COLORS: Record<string, string> = {
  ".": "transparent",
  s: "#f2cfa0", // skin
  h: "#4a4238", // hair dark
  H: "#6a4c3c", // hair light brown
  b: "#4f8cff", // body blue
  r: "#d46a5a", // body red
  g: "#5aa878", // body green
  y: "#e8c84a", // body yellow
  o: "#e88a4a", // body orange
  c: "#7a8698", // body slate
  p: "#a878c8", // body purple
  w: "#f2f5f9", // white detail
  k: "#2c3442", // outline
};

/* facing DOWN characters - 8 wide x 10 tall each, used with per-agent skin.
 * Template: body char 'b' is replaced per-agent at draw time. */
const CHAR_TEMPLATE: Record<CharDir, string[]> = {
  down: [
    "..hhhh..",
    ".hhhhhh.",
    ".hsssssh",
    ".sswswss",
    "..ssss..",
    ".bbbbbbb",
    ".bsbbsbb",
    ".bbbbbbb",
    "..ss.ss.",
    "..kk.kk.",
  ],
  up: [
    "..hhhh..",
    ".hhhhhh.",
    ".hhhhhhh",
    ".hhhhhhh",
    "..hhhh..",
    ".bbbbbbb",
    ".bbbbbbb",
    ".bbbbbbb",
    "..ss.ss.",
    "..kk.kk.",
  ],
  left: [
    "..hhhh..",
    ".hhhhhh.",
    ".hsssssh",
    ".sswssss",
    "..ssss..",
    ".bbbbbbb",
    ".sbbbbbb",
    ".bbbbbbb",
    "..ss.ss.",
    "..kk.kk.",
  ],
  right: [
    "..hhhh..",
    ".hhhhhh.",
    ".hsssssh",
    ".sssswss",
    "..ssss..",
    ".bbbbbbb",
    ".bbbbbbs",
    ".bbbbbbb",
    "..ss.ss.",
    "..kk.kk.",
  ],
};

export function charSprite(agentKey: string, dir: CharDir): { rows: string[]; skin: AgentSkin } {
  const skin = AGENT_SKINS[agentKey] ?? AGENT_SKINS.market_analyst;
  const rows = CHAR_TEMPLATE[dir].map((r) => r.replace(/b/g, skin.body).replace(/h/g, skin.hair));
  return { rows, skin };
}

export function charColor(ch: string): string {
  return CHAR_COLORS[ch] ?? "transparent";
}

/* Per-agent sprite variants: hair color overrides + body char.
 * 10 agents: market/news/sentiment/fundamentals analysts (blue tint family),
 * bull (red), bear (slate), research mgr (yellow), trader (green),
 * risk mgr (orange), portfolio mgr (purple). */
export interface AgentSkin { agent: string; body: string; hair: string; skin?: string }

export const AGENT_SKINS: Record<string, AgentSkin> = {
  market_analyst:       { agent: "market_analyst",       body: "b", hair: "h" },
  news_analyst:         { agent: "news_analyst",         body: "b", hair: "H" },
  sentiment_analyst:    { agent: "sentiment_analyst",    body: "b", hair: "h" },
  fundamentals_analyst: { agent: "fundamentals_analyst", body: "b", hair: "H" },
  bull_researcher:      { agent: "bull_researcher",      body: "r", hair: "h" },
  bear_researcher:      { agent: "bear_researcher",      body: "c", hair: "H" },
  research_manager:     { agent: "research_manager",     body: "y", hair: "h" },
  trader:               { agent: "trader",               body: "g", hair: "H" },
  risk_manager:         { agent: "risk_manager",         body: "o", hair: "h" },
  portfolio_manager:    { agent: "portfolio_manager",    body: "p", hair: "H" },
};

export function bodyColorOf(agentKey: string): string {
  return CHAR_COLORS[AGENT_SKINS[agentKey]?.body ?? "b"] ?? "#4f8cff";
}

const GRID: Record<string, string[]> = {
  office: [
    "............",
    "..11111111..",
    ".1111111111.",
    ".1111111111.",
    ".1110011111.",
    ".1110011111.",
    ".1111111111.",
    ".1100110011.",
    ".1100110011.",
    ".1111111111.",
    ".1111111111.",
    "..11111111..",
  ],
  portfolio: [
    "............",
    "...111111...",
    "..11111111..",
    "..1......1..",
    ".1111111111.",
    ".1111111111.",
    ".1111111111.",
    ".1111111111.",
    ".1111111111.",
    "..11111111..",
    "...111111...",
    "............",
  ],
  gear: [
    "....1111....",
    "..11111111..",
    ".1111111111.",
    ".1111111111.",
    ".1110111101.",
    "111111111111",
    "111110111101",
    "111110111101",
    ".1111111111.",
    ".1111111111.",
    "..11111111..",
    "....1111....",
  ],
  play: [
    "............",
    "..1.........",
    "..11........",
    "..111.......",
    "..1111......",
    "..11111.....",
    "..11111.....",
    "..1111......",
    "..111.......",
    "..11........",
    "..1.........",
    "............",
  ],
  pause: [
    "............",
    "..11....11..",
    "..11....11..",
    "..11....11..",
    "..11....11..",
    "..11....11..",
    "..11....11..",
    "..11....11..",
    "..11....11..",
    "..11....11..",
    "..11....11..",
    "............",
  ],
  download: [
    "............",
    "....1111....",
    "....1111....",
    "....1111....",
    "1111111111..".slice(0, 12),
    ".11111111...",
    "..111111....",
    "...1111.....",
    "....11......",
    "....11......",
    "............",
    "............",
  ],
  chart: [
    "............",
    "11..........",
    "11......11..",
    "11......11..",
    "111.....11..",
    "1111....11..",
    "1111..1111..",
    "11111.1111..",
    "11111.1111..",
    "11111111111.",
    "11111111111.",
    "............",
  ],
  shield: [
    "............",
    ".1111111111.",
    ".1111111111.",
    ".1111111111.",
    ".1111111111.",
    ".1110110111.",
    ".1111111111.",
    "..11111111..",
    "..11111111..",
    "...111111...",
    "....1111....",
    "............",
  ],
  key: [
    "............",
    ".111........",
    "1111........",
    "1111........",
    ".111........",
    "..11........",
    "..1111111111",
    "..1111111111",
    "..11....1111",
    "..11....1111",
    "............",
    "............",
  ],
  bolt: [
    "............",
    ".....111....",
    "....111.....",
    "...111......",
    "..11111111..",
    "....1111....",
    "...1111.....",
    "..1111......",
    "..111.......",
    "..11........",
    "..1.........",
    "............",
  ],
  warn: [
    "............",
    "....1111....",
    "...111111...",
    "...111111...",
    "..11111111..",
    "..11100111..".slice(0, 12),
    "..11100111..".slice(0, 12),
    ".1111111111.",
    ".1111111111.",
    ".1111111111.",
    ".1111111111.",
    "............",
  ],
};

export function makeIconCanvas(name: string, size = 36, color = "#4f8cff"): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  cv.className = "icon";
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  const rows = GRID[name] ?? GRID.office;
  const cell = size / 12;
  ctx.fillStyle = color;
  rows.forEach((row, y) => {
    row.split("").forEach((ch, x) => {
      if (ch === "1") ctx.fillRect(x * cell, y * cell, cell, cell);
    });
  });
  return cv;
}

export function hasIcon(name: string): boolean {
  return !!GRID[name];
}

/** Replace any <canvas class="ic" data-icon="name"> placeholders with real icons. */
export function mountIcons(root: ParentNode = document, color = "#4f8cff"): void {
  root.querySelectorAll<HTMLCanvasElement>("canvas.ic[data-icon]").forEach((cv) => {
    const name = cv.getAttribute("data-icon") ?? "office";
    const size = Number(cv.getAttribute("data-size") ?? 18);
    const made = makeIconCanvas(name, size, cv.getAttribute("data-color") ?? color);
    made.className = cv.className;
    cv.replaceWith(made);
  });
}
