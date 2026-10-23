/* Domain types shared by main-process modules. */

export type Action = "BUY" | "SELL" | "HOLD";
export type Mood = "idle" | "talk" | "think" | "excited" | "suspicious" | "data";

export interface AgentKey {
  key: string;
}

export interface Turn {
  key: string; // agent key (e.g. market_analyst)
  agent: string; // display name (한국어)
  mood: Mood;
  ts: string;
  content: string;
}

export interface Decision {
  action: Action;
  confidence: number; // 0..1
  symbol: string;
  order: PlanOrder | null;
}

export interface PlanOrder {
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  reason: string;
}

export interface MeetingRun {
  id: number;
  turns: Turn[];
}

/* Agent roles — TradingAgents pipeline order */
export interface AgentDef {
  key: string;
  name: string;
  role: string;
  phase: 1 | 2 | 3 | 4; // 1 analyst, 2 debate, 3 trader, 4 risk+pm
  room: "analysts" | "research" | "trading";
  desk: number; // seat index on the floor
  hasDesk: boolean | undefined;
}

export const AGENT_LIST: AgentDef[] = [
  { key: "market_analyst",        name: "기술 분석가",       role: "MA/RSI/MACD 지표로 추세 판독", phase: 1, room: "analysts", desk: 0, hasDesk: true },
  { key: "news_analyst",          name: "뉴스 분석가",       role: "뉴스·거시 이벤트 해석",         phase: 1, room: "analysts", desk: 1, hasDesk: true },
  { key: "sentiment_analyst",     name: "센티먼트 분석가",   role: "커뮤니티 여론 집계",           phase: 1, room: "analysts", desk: 2, hasDesk: true },
  { key: "fundamentals_analyst",  name: "펀더멘털 분석가",   role: "재무·밸류에이션 평가",         phase: 1, room: "analysts", desk: 3, hasDesk: true },
  { key: "bull_researcher",       name: "강세 리서처",       role: "매수 논거 반박",               phase: 2, room: "research", desk: 0, hasDesk: true },
  { key: "bear_researcher",       name: "약세 리서처",       role: "매도 논거 반박",               phase: 2, room: "research", desk: 1, hasDesk: true },
  { key: "research_manager",      name: "리서치 총괄",       role: "토론 중재·정리",               phase: 2, room: "research", desk: 2, hasDesk: true },
  { key: "trader",                name: "트레이더",          role: "매매안 제출",                  phase: 3, room: "trading",  desk: 0, hasDesk: true },
  { key: "risk_manager",          name: "리스크 매니저",     role: "손절·비중 검증",               phase: 4, room: "trading",  desk: 1, hasDesk: true },
  { key: "portfolio_manager",     name: "포트폴리오 매니저", role: "최종 승인/기각",               phase: 4, room: "trading",  desk: 2, hasDesk: true },
];

export interface Candle {
  t: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}
