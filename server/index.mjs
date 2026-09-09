#!/usr/bin/env node
/**
 * Zero-dep stdio MCP for Hyperdash public GraphQL / health reads.
 * No order or wallet mutations.
 */

import { createInterface } from "node:readline";

const BASE = (process.env.HYPERDASH_API_URL || "https://api.hyperdash.com").replace(/\/$/, "");
const UA = "hyperdash-info-mcp/0.2.0";
const TIMEFRAMES = new Set(["one_day", "seven_days", "thirty_days", "all"]);
const SYSTEM_GROUPS = new Set(["tagged", "copytraders", "equities", "btc", "hype", "cl"]);

const DELTA_TF_MAP = {
  "15m": "FIFTEEN_MINUTES",
  "15min": "FIFTEEN_MINUTES",
  fifteen_minutes: "FIFTEEN_MINUTES",
  FIFTEEN_MINUTES: "FIFTEEN_MINUTES",
  "1h": "ONE_HOUR",
  "1hr": "ONE_HOUR",
  one_hour: "ONE_HOUR",
  ONE_HOUR: "ONE_HOUR",
  "4h": "FOUR_HOURS",
  "4hr": "FOUR_HOURS",
  four_hours: "FOUR_HOURS",
  FOUR_HOURS: "FOUR_HOURS",
  "24h": "TWENTY_FOUR_HOURS",
  "1d": "TWENTY_FOUR_HOURS",
  twenty_four_hours: "TWENTY_FOUR_HOURS",
  TWENTY_FOUR_HOURS: "TWENTY_FOUR_HOURS",
  "3d": "THREE_DAYS",
  three_days: "THREE_DAYS",
  THREE_DAYS: "THREE_DAYS",
  "7d": "SEVEN_DAYS",
  seven_days: "SEVEN_DAYS",
  SEVEN_DAYS: "SEVEN_DAYS",
};

const WIDGET_TYPES = [
  "OI_SURGES",
  "IMMINENT_LIQUIDATIONS",
  "FUNDING_RATES",
  "SMART_MONEY_FLIPS",
  "CVD",
  "TOP_UPNL_CHANGES",
  "LARGEST_OPENED_TRADES",
  "NET_TWAP_PRESSURE",
  "ASSET_RETURNS",
  "TOP_PERP_UNREALIZED_PNL",
  "TOP_PERP_POSITIONS",
  "FRESH_WALLET_POSITIONS",
  "WHALE_DEPOSITS",
  "TOP_TWAPS",
  "LIQUIDATION_FEED",
  "OPEN_INTEREST",
  "USER_GROWTH",
  "AF_BUYBACKS",
  "PERP_PRICE_CHANGES",
  "NET_POSITIONING",
];
const WIDGET_TYPE_SET = new Set(WIDGET_TYPES);

const WIDGET_DATA_SELECTIONS = {
  OI_SURGES: `... on OiSurgesWidgetData {
        interval
        rows { market openInterestUsd changeUsd changePct zscore markPrice }
      }`,
  IMMINENT_LIQUIDATIONS: `... on ImminentLiquidationsWidgetData {
        timestamp
        positions { address market side notionalSize entryPrice liquidationPrice markPrice distancePct accountValue }
      }`,
  FUNDING_RATES: `... on FundingRatesWidgetData {
        timestamp
        rows { market fundingRate fundingAprPct markPrice openInterestUsd dayVolumeUsd }
      }`,
  SMART_MONEY_FLIPS: `... on SmartMoneyFlipsWidgetData {
        coin currentSide netNotional
        flips { timestamp fromSide toSide netBefore netAfter }
        history { timestamp longNotional shortNotional netNotional }
      }`,
  CVD: `... on CvdWidgetData {
        market granularity
        points { bucket cvd delta }
      }`,
  TOP_UPNL_CHANGES: `... on TopUpnlChangesWidgetData {
        interval direction
        rows { address upnlNow upnlThen upnlDelta notionalNow openPositions accountValue }
      }`,
  LARGEST_OPENED_TRADES: `... on LargestOpenedTradesWidgetData {
        trades { address market direction notional size avgPrice fillCount firstFillTime lastFillTime }
      }`,
  NET_TWAP_PRESSURE: `... on NetTwapPressureWidgetData {
        executed { market bucket buyNotional sellNotional netNotional twapCount fillCount }
        active { market buyNotional sellNotional netNotional twapCount }
      }`,
  ASSET_RETURNS: `... on AssetReturnsWidgetData {
        rows { market priceNow return1hPct return4hPct return1dPct return7dPct return30dPct }
      }`,
  TOP_PERP_UNREALIZED_PNL: `... on TopPerpUnrealizedPnlWidgetData {
        timestamp
        winners { address market size notionalSize entryPrice liquidationPrice unrealizedPnl fundingPnl accountValue displayName label verified }
        losers { address market size notionalSize entryPrice liquidationPrice unrealizedPnl fundingPnl accountValue displayName label verified }
      }`,
  TOP_PERP_POSITIONS: `... on TopPerpPositionsWidgetData {
        timestamp
        positions { address market size notionalSize entryPrice liquidationPrice unrealizedPnl fundingPnl accountValue displayName label verified }
      }`,
  FRESH_WALLET_POSITIONS: `... on FreshWalletPositionsWidgetData {
        timestamp
        positions { address market size notionalSize entryPrice liquidationPrice unrealizedPnl fundingPnl accountValue }
      }`,
  WHALE_DEPOSITS: `... on WhaleDepositsWidgetData {
        deposits { address timestamp hash amountUsd fee }
      }`,
  TOP_TWAPS: `... on TopTwapsWidgetData {
        twaps { twapId user asset market side executedNtl executedSz totalSz progressPct minutes createdAt reduceOnly }
      }`,
  LIQUIDATION_FEED: `... on LiquidationFeedWidgetData {
        liquidations { id coin side dir px sz time closedPnl liquidation { liquidatedUser } }
      }`,
  OPEN_INTEREST: `... on OpenInterestWidgetData {
        points { symbol timestamp openInterestUsd markPx }
      }`,
  USER_GROWTH: `... on UserGrowthWidgetData {
        granularity
        points { bucket newWallets cumulativeWallets }
      }`,
  AF_BUYBACKS: `... on AfBuybacksWidgetData {
        totalBuyNotional
        points { day market buyNotional sellNotional }
      }`,
  PERP_PRICE_CHANGES: `... on PerpPriceChangesWidgetData {
        timestamp marketCount
        gainers { market markPrice changePct }
        losers { market markPrice changePct }
      }`,
  NET_POSITIONING: `... on NetPositioningWidgetData {
        summary { longNotional shortNotional netNotional addressCount timestamp }
        assets { market longNotional shortNotional netNotional longPositions shortPositions }
      }`,
};

function widgetQuery(type) {
  const frag = WIDGET_DATA_SELECTIONS[type];
  if (!frag) throw new Error(`No selection for widget type ${type}`);
  return `query WidgetRequest($request: WidgetRequest!) {
  widget(request: $request) {
    id
    type
    error
    data {
      __typename
      ${frag}
    }
  }
}`;
}

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
  // --- 0.2.0 new tools ---
  {
    name: "list_liquidation_totals",
    description: "LiquidationTotal[] aggregates per market over a window.",
    inputSchema: {
      type: "object",
      properties: {
        windowHours: { type: "integer", description: "Lookback hours." },
        limit: { type: "integer", description: "Max markets." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_perp_deltas",
    description:
      "Perp position size deltas by address. timeframe: 15m|1h|4h|24h|3d|7d or GraphQL enum FIFTEEN_MINUTES|ONE_HOUR|FOUR_HOURS|TWENTY_FOUR_HOURS|THREE_DAYS|SEVEN_DAYS.",
    inputSchema: {
      type: "object",
      properties: {
        market: { type: "string" },
        timeframe: { type: "string" },
      },
      required: ["market", "timeframe"],
      additionalProperties: false,
    },
  },
  {
    name: "get_spot_deltas",
    description: "Spot balance deltas by address for a token. Same timeframe enum as get_perp_deltas.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string" },
        timeframe: { type: "string" },
      },
      required: ["token", "timeframe"],
      additionalProperties: false,
    },
  },
  {
    name: "get_trader_best_trades",
    description: "Best completed trades for an address.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string" },
        limit: { type: "integer", description: "Default 10." },
      },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "get_trader_stats_per_asset",
    description: "Per-coin PnL/fees/volume stats for an address.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string" } },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "get_trader_detailed_stats",
    description: "Duration/streak/PnL summary for an address.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string" } },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "list_trader_completed_trades",
    description: "Paginated completed trades for an address.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string" },
        page: { type: "integer", description: "Default 1." },
        pageSize: { type: "integer", description: "Default 20." },
      },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "get_traders",
    description: "Batch TraderSummary for addresses[]. Optional timeframe one_day|seven_days|thirty_days|all.",
    inputSchema: {
      type: "object",
      properties: {
        addresses: { type: "array", items: { type: "string" } },
        timeframe: {
          type: "string",
          enum: ["one_day", "seven_days", "thirty_days", "all"],
        },
      },
      required: ["addresses"],
      additionalProperties: false,
    },
  },
  {
    name: "list_system_group_traders",
    description: "System cohort traders. groupId: tagged|copytraders|equities|btc|hype|cl.",
    inputSchema: {
      type: "object",
      properties: {
        groupId: {
          type: "string",
          enum: ["tagged", "copytraders", "equities", "btc", "hype", "cl"],
        },
      },
      required: ["groupId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_group",
    description: "Group metadata + wallet list (system ids work: tagged|btc|hype|...).",
    inputSchema: {
      type: "object",
      properties: { groupId: { type: "string" } },
      required: ["groupId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_liquidation_levels",
    description:
      "Liquidation heatmap bands via liquidationLevelsV2. Defaults: last 24h; BTC-ish band 50k–120k if min/max omitted.",
    inputSchema: {
      type: "object",
      properties: {
        coin: { type: "string" },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
        startTime: { type: "number", description: "Epoch ms. Default now-24h." },
        endTime: { type: "number", description: "Epoch ms. Default now." },
      },
      required: ["coin"],
      additionalProperties: false,
    },
  },
  {
    name: "get_current_top_liquidations",
    description: "Current top long/short liquidation clusters in a price band.",
    inputSchema: {
      type: "object",
      properties: {
        coin: { type: "string" },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
      },
      required: ["coin"],
      additionalProperties: false,
    },
  },
  {
    name: "get_historical_open_interest",
    description: "OI time series for tokens (timeframe e.g. 7d|30d).",
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
  {
    name: "get_perps_market_participation",
    description: "Global + size/pnl cohort participation across perps.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_spot_ticker_positions",
    description: "Top spot holders for a coin (e.g. HYPE).",
    inputSchema: {
      type: "object",
      properties: {
        coin: { type: "string" },
        limit: { type: "integer", description: "Default 10." },
        offset: { type: "integer", description: "Default 0." },
      },
      required: ["coin"],
      additionalProperties: false,
    },
  },
  {
    name: "get_orderbook_snapshot_filtered",
    description:
      "Resting orders in a price band. Prefer ETH or narrow bands — very wide BTC bands may 500.",
    inputSchema: {
      type: "object",
      properties: {
        market: { type: "string" },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
      },
      required: ["market", "minPrice", "maxPrice"],
      additionalProperties: false,
    },
  },
  {
    name: "get_trader_perp_positions_at",
    description: "Trader perp positions snapshot at epoch-ms timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string" },
        timestamp: { type: "number", description: "Epoch ms." },
        limit: { type: "integer", description: "Default 20." },
      },
      required: ["address", "timestamp"],
      additionalProperties: false,
    },
  },
  {
    name: "list_perp_rfq_markets",
    description: "RFQ-enabled perp market symbols (e.g. xyz:AAPL).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_widget",
    description:
      "Flexible dashboard widget. type enum of working widgets; optional nested params. Empty params auto-builds camelCase key (OI_SURGES→oiSurges). SMART_MONEY_FLIPS needs {coin}; CVD needs {market}.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: WIDGET_TYPES },
        params: {
          type: "object",
          description: "Widget-specific nested fields (coin/market/etc) or full nested object.",
        },
        id: { type: "string", description: "Optional request id; defaults to type." },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
];

function snakeToCamel(s) {
  return String(s)
    .toLowerCase()
    .replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function resolveDeltaTimeframe(raw) {
  const key = String(raw || "").trim();
  const mapped = DELTA_TF_MAP[key] || DELTA_TF_MAP[key.toLowerCase()];
  if (!mapped) {
    throw new Error(
      "timeframe must be 15m|1h|4h|24h|3d|7d or FIFTEEN_MINUTES|ONE_HOUR|FOUR_HOURS|TWENTY_FOUR_HOURS|THREE_DAYS|SEVEN_DAYS"
    );
  }
  return mapped;
}

function defaultPriceBand(coin) {
  const c = String(coin || "").toUpperCase();
  if (c === "BTC") return { minPrice: 50000, maxPrice: 120000 };
  if (c === "ETH") return { minPrice: 1000, maxPrice: 10000 };
  if (c === "HYPE") return { minPrice: 0, maxPrice: 200 };
  return { minPrice: 0, maxPrice: 1e6 };
}

function buildWidgetParams(type, params) {
  const key = snakeToCamel(type);
  if (params == null || (typeof params === "object" && !Array.isArray(params) && Object.keys(params).length === 0)) {
    return { [key]: {} };
  }
  if (params && typeof params === "object" && key in params) {
    return params;
  }
  // Treat flat params as the nested object's fields
  return { [key]: params };
}

async function restGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", "user-agent": UA },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
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
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
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
      try {
        return await restGet("/health");
      } catch {
        return await restGet("/");
      }
    }
    case "list_asset_price_changes":
      return (
        await gql(`query AssetPriceChanges {
        assetPriceChanges { coin price pct24h pct7d pct30d dayVolume openInterest }
      }`)
      ).assetPriceChanges;
    case "explore_traders": {
      if (!TIMEFRAMES.has(args.timeframe)) {
        throw new Error("timeframe must be one_day|seven_days|thirty_days|all");
      }
      return (
        await gql(
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
        )
      ).exploreTraders;
    }
    case "get_trader": {
      if (!args.address) throw new Error("address is required");
      return (
        await gql(
          `query GetTrader($address: String!) {
          getTrader(address: $address) {
            address label verified displayName avatar twitter pnl perpsEquity winrate winrate7d winrate30d winrateAllTime pnlCohort sizeCohort totalTrades trades7d trades30d totalLongTrades totalShortTrades totalWinningTrades totalLosingTrades sharpe sharpe7d sharpe30d drawdown drawdown7d drawdown30d drawdownAllTime copyScore tag
          }
        }`,
          { address: args.address }
        )
      ).getTrader;
    }
    case "get_asset_top_traders": {
      if (!args.coin) throw new Error("coin is required");
      return (
        await gql(
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
        )
      ).analytics.winners;
    }
    case "get_recent_liquidations":
      return (
        await gql(`query GetRecentLiquidations {
        recentLiquidations { id address coin px sz side time startPosition dir closedPnl hash oid tid liquidation { liquidatedUser markPx method } }
      }`)
      ).recentLiquidations;
    case "get_news":
      return (
        await gql(
          `query NewsItems($since: Float, $limit: Int) {
          newsItems(since: $since, limit: $limit) {
            id provider providerId streamId headline body publishedAt receivedAt sourceName sourceLink providerTickers
            enrichment { tickers sentiment enrichedAt model prices }
          }
        }`,
          { limit: args.limit ?? 20, since: args.since }
        )
      ).newsItems;
    case "get_current_twaps":
      return (
        await gql(
          `query GetCurrentTwaps($market: String, $type: String) {
          currentTwaps(market: $market, type: $type) {
            twapId user market asset type side totalSz executedSz remainingSz executedNtl progressPct status statusMessage minutes reduceOnly randomize createdAt updatedAt
          }
        }`,
          { market: args.market, type: args.type }
        )
      ).currentTwaps;
    case "get_historical_funding_rates": {
      if (!Array.isArray(args.tokens) || !args.tokens.length) {
        throw new Error("tokens array is required");
      }
      return (
        await gql(
          `query HistoricalFundingRates($tokens: [String!]!, $timeframe: String) {
          analytics { historicalFundingRates(tokens: $tokens, timeframe: $timeframe) }
        }`,
          { tokens: args.tokens, timeframe: args.timeframe }
        )
      ).analytics.historicalFundingRates;
    }

    case "list_liquidation_totals":
      return (
        await gql(
          `query LiquidationTotals($windowHours: Int, $limit: Int) {
          liquidationTotals(windowHours: $windowHours, limit: $limit) {
            market events totalNotional longNotional shortNotional largestNotional wallets
            traderEvents traderNotional traderLongNotional traderShortNotional traderLargestNotional traderWallets
          }
        }`,
          { windowHours: args.windowHours, limit: args.limit }
        )
      ).liquidationTotals;

    case "get_perp_deltas": {
      if (!args.market) throw new Error("market is required");
      const timeframe = resolveDeltaTimeframe(args.timeframe);
      return (
        await gql(
          `query GetPerpDeltas($market: String!, $timeframe: DeltaTimeframe!) {
          perpDeltas(market: $market, timeframe: $timeframe) {
            market timeframe
            deltas { address current delta }
          }
        }`,
          { market: args.market, timeframe }
        )
      ).perpDeltas;
    }

    case "get_spot_deltas": {
      if (!args.token) throw new Error("token is required");
      const timeframe = resolveDeltaTimeframe(args.timeframe);
      return (
        await gql(
          `query GetSpotDeltas($token: String!, $timeframe: DeltaTimeframe!) {
          spotDeltas(token: $token, timeframe: $timeframe) {
            market timeframe
            deltas { address current delta }
          }
        }`,
          { token: args.token, timeframe }
        )
      ).spotDeltas;
    }

    case "get_trader_best_trades": {
      if (!args.address) throw new Error("address is required");
      return (
        await gql(
          `query GetTraderBestTrades($address: String!, $limit: Int) {
          getTraderBestTrades(address: $address, limit: $limit) {
            coin direction startTime endTime durationMins sz avgEntryPx avgExitPx grossPnl fundingPnl totalFees netPnl
          }
        }`,
          { address: args.address, limit: args.limit ?? 10 }
        )
      ).getTraderBestTrades;
    }

    case "get_trader_stats_per_asset": {
      if (!args.address) throw new Error("address is required");
      return (
        await gql(
          `query GetTraderStatsPerAsset($address: String!) {
          getTraderStatsPerAsset(address: $address) {
            coin totalPnl totalFees netPnl numberOfTrades winningTrades losingTrades volume
          }
        }`,
          { address: args.address }
        )
      ).getTraderStatsPerAsset;
    }

    case "get_trader_detailed_stats": {
      if (!args.address) throw new Error("address is required");
      return (
        await gql(
          `query GetTraderDetailedStatsSummary($address: String!) {
          getTraderDetailedStatsSummary(address: $address) {
            tradeCount startDate endDate
            completedTradePnl { pnl longPnl shortPnl fees net }
            durationStats { avgDurationMinutes medianDurationMinutes q1DurationMinutes q3DurationMinutes }
            longestWinStreak
          }
        }`,
          { address: args.address }
        )
      ).getTraderDetailedStatsSummary;
    }

    case "list_trader_completed_trades": {
      if (!args.address) throw new Error("address is required");
      return (
        await gql(
          `query GetTraderCompletedTrades($address: String!, $page: Int, $pageSize: Int) {
          getTraderCompletedTrades(address: $address, page: $page, pageSize: $pageSize) {
            tradeCount
            assetTradeCounts { coin tradeCount }
            trades {
              startTime endTime coin direction durationMins sz avgEntryPx avgExitPx
              grossPnl fundingPnl totalFees netPnl notional
            }
          }
        }`,
          {
            address: args.address,
            page: args.page ?? 1,
            pageSize: args.pageSize ?? 20,
          }
        )
      ).getTraderCompletedTrades;
    }

    case "get_traders": {
      if (!Array.isArray(args.addresses) || !args.addresses.length) {
        throw new Error("addresses array is required");
      }
      if (args.timeframe != null && !TIMEFRAMES.has(args.timeframe)) {
        throw new Error("timeframe must be one_day|seven_days|thirty_days|all");
      }
      return (
        await gql(
          `query GetTraders($addresses: [String!]!, $timeframe: TraderTimeframe) {
          getTraders(addresses: $addresses, timeframe: $timeframe) {
            address label avatar displayName pnl pnlCohort sharpe sizeCohort winrate
            totalWinningTrades totalTrades totalShortTrades totalLosingTrades totalLongTrades
            copyScore drawdown
            portfolioGraph { timestamp value }
          }
        }`,
          { addresses: args.addresses, timeframe: args.timeframe }
        )
      ).getTraders;
    }

    case "list_system_group_traders": {
      if (!args.groupId || !SYSTEM_GROUPS.has(args.groupId)) {
        throw new Error("groupId must be tagged|copytraders|equities|btc|hype|cl");
      }
      return (
        await gql(
          `query GetSystemGroupTraders($groupId: ID!) {
          getSystemGroupTraders(groupId: $groupId) {
            address label verified displayName avatar twitter lastTradeAt lastFillAt
            portfolioGraph { timestamp value }
            pnl perpsEquity winrate pnlCohort sizeCohort totalTrades totalLongTrades totalShortTrades
            totalWinningTrades totalLosingTrades sharpe drawdown copyScore tag
            topAssets { coin volume pnl }
          }
        }`,
          { groupId: args.groupId }
        )
      ).getSystemGroupTraders;
    }

    case "get_group": {
      if (!args.groupId) throw new Error("groupId is required");
      return (
        await gql(
          `query GetGroup($groupId: ID!) {
          getGroup(groupId: $groupId) {
            id name emoji colorHex
            owner { id username avatar }
            wallets { address label emoji createdAt updatedAt }
            createdAt updatedAt
          }
        }`,
          { groupId: args.groupId }
        )
      ).getGroup;
    }

    case "get_liquidation_levels": {
      if (!args.coin) throw new Error("coin is required");
      const band = defaultPriceBand(args.coin);
      const now = Date.now();
      return (
        await gql(
          `query GetLiquidationLevelsV2(
          $coin: String!, $minPrice: Float!, $maxPrice: Float!, $startTime: Float!, $endTime: Float
        ) {
          analytics {
            liquidationLevels: liquidationLevelsV2(
              coin: $coin minPrice: $minPrice maxPrice: $maxPrice startTime: $startTime endTime: $endTime
            ) {
              coin currentPrice bandSize minPrice maxPrice
              bands { minPrice maxPrice historicalData { timestamp totalAmount } }
              totalLongLiquidations { size count }
              totalShortLiquidations { size count }
              topLongLiquidations { address price size }
              topShortLiquidations { address price size }
              timestamp
            }
          }
        }`,
          {
            coin: args.coin,
            minPrice: args.minPrice ?? band.minPrice,
            maxPrice: args.maxPrice ?? band.maxPrice,
            startTime: args.startTime ?? now - 86400000,
            endTime: args.endTime ?? now,
          }
        )
      ).analytics.liquidationLevels;
    }

    case "get_current_top_liquidations": {
      if (!args.coin) throw new Error("coin is required");
      const band = defaultPriceBand(args.coin);
      return (
        await gql(
          `query GetCurrentTopLiquidations($coin: String!, $minPrice: Float!, $maxPrice: Float!) {
          analytics {
            currentTopLiquidations(coin: $coin, minPrice: $minPrice, maxPrice: $maxPrice, limit: 5) {
              coin minPrice maxPrice
              longs { address price size }
              shorts { address price size }
              longTotals { size count }
              shortTotals { size count }
              snapshotTimestamp
            }
          }
        }`,
          {
            coin: args.coin,
            minPrice: args.minPrice ?? band.minPrice,
            maxPrice: args.maxPrice ?? band.maxPrice,
          }
        )
      ).analytics.currentTopLiquidations;
    }

    case "get_historical_open_interest": {
      if (!Array.isArray(args.tokens) || !args.tokens.length) {
        throw new Error("tokens array is required");
      }
      return (
        await gql(
          `query AssetBoardHistoricalOpenInterest($tokens: [String!]!, $timeframe: String) {
          analytics { historicalOpenInterest(tokens: $tokens, timeframe: $timeframe) }
        }`,
          { tokens: args.tokens, timeframe: args.timeframe }
        )
      ).analytics.historicalOpenInterest;
    }

    case "get_perps_market_participation":
      return (
        await gql(`query GetPerpsMarketParticipation {
        analytics {
          perpsMarketParticipation {
            timestamp
            global {
              coin longTraderCount shortTraderCount profitableTraderCount losingTraderCount
              totalLongNotional totalShortNotional
            }
            sizeCohorts {
              cohortId cohortLabel cohortEmoji cohortRange
              markets {
                coin longTraderCount shortTraderCount profitableTraderCount losingTraderCount
                totalLongNotional totalShortNotional
              }
            }
            pnlCohorts {
              cohortId cohortLabel cohortEmoji cohortRange
              markets {
                coin longTraderCount shortTraderCount profitableTraderCount losingTraderCount
                totalLongNotional totalShortNotional
              }
            }
          }
        }
      }`)
      ).analytics.perpsMarketParticipation;

    case "list_spot_ticker_positions": {
      if (!args.coin) throw new Error("coin is required");
      return (
        await gql(
          `query GetSpotTickerPositions($coin: String!, $limit: Int, $offset: Int) {
          analytics {
            spotTickerPositions(coin: $coin, limit: $limit, offset: $offset) {
              coin
              positions { address avatar displayName label tag verified copyScore balance }
              totalBalance holderCount totalCount hasMore timestamp
            }
          }
        }`,
          { coin: args.coin, limit: args.limit ?? 10, offset: args.offset ?? 0 }
        )
      ).analytics.spotTickerPositions;
    }

    case "get_orderbook_snapshot_filtered": {
      if (!args.market) throw new Error("market is required");
      if (args.minPrice == null || args.maxPrice == null) {
        throw new Error("minPrice and maxPrice are required");
      }
      const span = Number(args.maxPrice) - Number(args.minPrice);
      const warning =
        String(args.market).toUpperCase() === "BTC" && span > 20000
          ? "Wide BTC bands may fail or return huge payloads; prefer ETH or narrower bands."
          : undefined;
      const rows = (
        await gql(
          `query GetOrderbookSnapshotFiltered($market: String!, $minPrice: Float!, $maxPrice: Float!) {
          orderbookSnapshotFiltered(market: $market, minPrice: $minPrice, maxPrice: $maxPrice) {
            address
            order { coin side limitPx sz }
          }
        }`,
          { market: args.market, minPrice: args.minPrice, maxPrice: args.maxPrice }
        )
      ).orderbookSnapshotFiltered;
      if (warning) return { warning, count: Array.isArray(rows) ? rows.length : null, rows };
      return rows;
    }

    case "get_trader_perp_positions_at": {
      if (!args.address) throw new Error("address is required");
      if (args.timestamp == null) throw new Error("timestamp is required");
      return (
        await gql(
          `query TraderPerpPositionsTooltip($address: String!, $timestamp: Float!, $limit: Int) {
          traderPerpPositionsTooltip(address: $address, timestamp: $timestamp, limit: $limit) {
            requestedTs bucketTs positionsCount totalUnrealizedPnl
            positions { market size notionalSize entryPrice liquidationPrice unrealizedPnl fundingPnl }
          }
        }`,
          {
            address: args.address,
            timestamp: args.timestamp,
            limit: args.limit ?? 20,
          }
        )
      ).traderPerpPositionsTooltip;
    }

    case "list_perp_rfq_markets":
      return (await gql(`query PerpRfqMarkets { perpRfqMarkets }`)).perpRfqMarkets;

    case "get_widget": {
      const type = args.type;
      if (!WIDGET_TYPE_SET.has(type)) {
        throw new Error(`type must be one of: ${WIDGET_TYPES.join(", ")}`);
      }
      const request = {
        id: args.id || type,
        type,
        params: buildWidgetParams(type, args.params),
      };
      return (await gql(widgetQuery(type), { request })).widget;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
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
        serverInfo: { name: "hyperdash-info", version: "0.2.0" },
      });
      return;
    }
    if (method === "ping") {
      ok(id, {});
      return;
    }
    if (method === "tools/list") {
      ok(id, { tools: TOOLS });
      return;
    }
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
  try {
    handle(JSON.parse(t));
  } catch {
    /* ignore */
  }
});
rl.on("close", () => process.exit(0));
