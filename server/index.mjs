#!/usr/bin/env node
/**
 * Zero-dep stdio MCP for Hyperdash public GraphQL / health reads.
 * No order or wallet mutations.
 */

import { createInterface } from "node:readline";

const BASE = (process.env.HYPERDASH_API_URL || "https://api.hyperdash.com").replace(/\/$/, "");
const UA = "hyperdash-info-mcp/0.1.0";
const TIMEFRAMES = new Set(["one_day", "seven_days", "thirty_days", "all"]);

const TOOLS = [
  {
    name: "get_health",
    description: "HealthStatus from REST /health (fallback /).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_asset_price_changes",
    description: "AssetPriceChange[] — price, pct24h/7d/30d, dayVolume, openInterest for all tracked markets.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "explore_traders",
    description: "TraderSummary page from exploreTraders leaderboard.",
    inputSchema: {
      type: "object",
      properties: {
        timeframe: {
          type: "string",
          enum: ["one_day", "seven_days", "thirty_days", "all"],
          description: "Required. Lowercase enum.",
        },
        page: { type: "integer", description: "Default 1." },
        pageSize: { type: "integer", description: "Default 20." },
      },
      required: ["timeframe"],
      additionalProperties: false,
    },
  },
  {
    name: "get_trader",
    description: "TraderSummary for one address.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string" } },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "get_asset_top_traders",
    description: "Top TickerPosition rows by unrealized PnL on a coin (e.g. BTC, HYPE, xyz:NVDA).",
    inputSchema: {
      type: "object",
      properties: {
        coin: { type: "string" },
        limit: { type: "integer", description: "Default 10." },
      },
      required: ["coin"],
      additionalProperties: false,
    },
  },
  {
    name: "get_recent_liquidations",
    description: "Liquidation[] recent tape.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_news",
    description: "NewsItem[] latest headlines.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Default 20." },
        since: { type: "number", description: "Optional epoch ms lower bound." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_current_twaps",
    description: "TwapOrder[] active TWAPs; optional market filter.",
    inputSchema: {
      type: "object",
      properties: {
        market: { type: "string" },
        type: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_historical_funding_rates",
    description: "FundingHistory for token list (e.g. [\"BTC\",\"ETH\"]).",
    inputSchema: {
      type: "object",
      properties: {
        tokens: { type: "array", items: { type: "string" } },
        timeframe: { type: "string" },
      },
      required: ["tokens"],
      additionalProperties: false,
    },
  },
];

async function restGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", "user-agent": UA },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${BASE}${path}`);
    err.body = data;
    throw err;
  }
  return data;
}

async function gql(query, variables) {
  const res = await fetch(`${BASE}/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": UA,
      "x-client-app": "hyperdash-info-mcp",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} GraphQL`);
    err.body = payload;
    throw err;
  }
  if (payload?.errors?.length) {
    const err = new Error(payload.errors.map((e) => e.message).join("; "));
    err.body = payload.errors;
    throw err;
  }
  return payload.data;
}

async function callTool(name, args = {}) {
  switch (name) {
    case "get_health": {
      try { return await restGet("/health"); }
      catch { return await restGet("/"); }
    }
    case "list_asset_price_changes":
      return (await gql(`query AssetPriceChanges {
        assetPriceChanges { coin price pct24h pct7d pct30d dayVolume openInterest }
      }`)).assetPriceChanges;
    case "explore_traders": {
      if (!TIMEFRAMES.has(args.timeframe)) {
        throw new Error("timeframe must be one_day|seven_days|thirty_days|all");
      }
      return (await gql(
        `query ExploreTraders($page: Int, $pageSize: Int, $timeframe: TraderTimeframe!) {
          exploreTraders(page: $page, pageSize: $pageSize, timeframe: $timeframe) {
            data { address label verified displayName avatar twitter pnl perpsEquity winrate pnlCohort sizeCohort totalTrades totalLongTrades totalShortTrades totalWinningTrades totalLosingTrades sharpe drawdown copyScore tag }
            pagination { page pageSize totalItems totalPages }
          }
        }`,
        {
          page: args.page ?? 1,
          pageSize: args.pageSize ?? 20,
          timeframe: args.timeframe,
        }
      )).exploreTraders;
    }
    case "get_trader": {
      if (!args.address) throw new Error("address is required");
      return (await gql(
        `query GetTrader($address: String!) {
          getTrader(address: $address) {
            address label verified displayName avatar twitter pnl perpsEquity winrate winrate7d winrate30d winrateAllTime pnlCohort sizeCohort totalTrades trades7d trades30d totalLongTrades totalShortTrades totalWinningTrades totalLosingTrades sharpe sharpe7d sharpe30d drawdown drawdown7d drawdown30d drawdownAllTime copyScore tag
          }
        }`,
        { address: args.address }
      )).getTrader;
    }
    case "get_asset_top_traders": {
      if (!args.coin) throw new Error("coin is required");
      return (await gql(
        `query GetAssetTopTraders($coin: String!, $pnlLimit: Int) {
          analytics {
            winners: perpsTickerPositions(
              coin: $coin
              limit: $pnlLimit
              offset: 0
              sortBy: { field: unrealizedPnl, order: desc }
            ) {
              coin
              positions { address avatar displayName label size notionalSize unrealizedPnl }
              totalCount
            }
          }
        }`,
        { coin: args.coin, pnlLimit: args.limit ?? 10 }
      )).analytics.winners;
    }
    case "get_recent_liquidations":
      return (await gql(`query GetRecentLiquidations {
        recentLiquidations { id address coin px sz side time startPosition dir closedPnl hash oid tid liquidation { liquidatedUser markPx method } }
      }`)).recentLiquidations;
    case "get_news":
      return (await gql(
        `query NewsItems($since: Float, $limit: Int) {
          newsItems(since: $since, limit: $limit) {
            id provider providerId streamId headline body publishedAt receivedAt sourceName sourceLink providerTickers
            enrichment { tickers sentiment enrichedAt model prices }
          }
        }`,
        { limit: args.limit ?? 20, since: args.since }
      )).newsItems;
    case "get_current_twaps":
      return (await gql(
        `query GetCurrentTwaps($market: String, $type: String) {
          currentTwaps(market: $market, type: $type) {
            twapId user market asset type side totalSz executedSz remainingSz executedNtl progressPct status statusMessage minutes reduceOnly randomize createdAt updatedAt
          }
        }`,
        { market: args.market, type: args.type }
      )).currentTwaps;
    case "get_historical_funding_rates": {
      if (!Array.isArray(args.tokens) || !args.tokens.length) {
        throw new Error("tokens array is required");
      }
      return (await gql(
        `query HistoricalFundingRates($tokens: [String!]!, $timeframe: String) {
          analytics { historicalFundingRates(tokens: $tokens, timeframe: $timeframe) }
        }`,
        { tokens: args.tokens, timeframe: args.timeframe }
      )).analytics.historicalFundingRates;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function ok(id, result) { send({ jsonrpc: "2.0", id, result }); }
function fail(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  send({ jsonrpc: "2.0", id, error });
}

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method, params } = msg;
  if (method === "notifications/initialized" || method?.startsWith("notifications/")) return;
  if (id === undefined || id === null) return;
  try {
    if (method === "initialize") {
      ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "hyperdash-info", version: "0.1.0" },
      });
      return;
    }
    if (method === "ping") { ok(id, {}); return; }
    if (method === "tools/list") { ok(id, { tools: TOOLS }); return; }
    if (method === "tools/call") {
      const result = await callTool(params?.name, params?.arguments ?? {});
      ok(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      });
      return;
    }
    fail(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    fail(id, -32000, e?.message || String(e), e?.body);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  try { handle(JSON.parse(t)); } catch { /* ignore */ }
});
rl.on("close", () => process.exit(0));
