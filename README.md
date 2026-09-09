# hyperdash-info

Cursor / Agent Plugin for **Hyperdash** public market intel (Hyperliquid terminal).

- REST: `GET https://api.hyperdash.com/health`
- GraphQL: `POST https://api.hyperdash.com/graphql` (introspection disabled; operations reverse-mapped from the web app)

Read-only. No order / strategy / wallet mutations.

Site: https://hyperdash.com · Docs: https://docs.hyperdash.com (product docs; published OpenAPI there is currently a Mintlify placeholder)

## Domain types

| Type | Meaning |
| --- | --- |
| `HealthStatus` | `{ status, timestamp? }` |
| `AssetPriceChange` | coin, price, pct24h/7d/30d, dayVolume, openInterest |
| `TraderSummary` | address, pnl, winrate, equity, sharpe, copyScore, … |
| `TickerPosition` | size / notional / unrealizedPnl on a coin |
| `Liquidation` | recent liq print |
| `LiquidationTotal` | per-market liq aggregates over a window |
| `LiquidationLevels` | heatmap bands + top long/short clusters |
| `DeltaRow` / `PerpDeltas` | address, current, delta over a timeframe |
| `CompletedTrade` | coin, direction, entry/exit, gross/net PnL |
| `TraderAssetStats` | per-coin PnL/fees/volume |
| `SpotTickerPosition` | spot holder balance + label |
| `MarketParticipation` | long/short trader counts + notional by cohort |
| `OrderbookResting` | address + resting order in a price band |
| `NewsItem` | headline + source (+ optional enrichment) |
| `TwapOrder` | active TWAP clip |
| `FundingHistory` | raw analytics.historicalFundingRates payload |
| `WidgetRequest` | `{ id, type, params }` nested per-widget camelCase key |

## Install

Copy to `~/.cursor/plugins/local/hyperdash-info`, Reload Window.

## MCP tools (28)

### Core (0.1)

| Tool | Notes |
| --- | --- |
| `get_health` | REST `/` or `/health` |
| `list_asset_price_changes` | all tracked perps incl. `xyz:*` HIP-3 |
| `explore_traders` | timeframe: `one_day` \| `seven_days` \| `thirty_days` \| `all` |
| `get_trader` | by address |
| `get_asset_top_traders` | top unrealized PnL on a coin |
| `get_recent_liquidations` | live liq tape |
| `get_news` | latest headlines |
| `get_current_twaps` | optional `market` filter |
| `get_historical_funding_rates` | `tokens[]`, optional timeframe |

### Liquidations & OI (0.2)

| Tool | Notes |
| --- | --- |
| `list_liquidation_totals` | per-market aggregates (`windowHours`, `limit`) |
| `get_liquidation_levels` | V2 heatmap bands (coin; optional price/time) |
| `get_current_top_liquidations` | top long/short clusters in band |
| `get_historical_open_interest` | OI series (`tokens[]`, e.g. `7d`) |
| `get_perps_market_participation` | global + size/pnl cohorts |

### Deltas & orderbook

| Tool | Notes |
| --- | --- |
| `get_perp_deltas` | market + timeframe (`15m`/`1h`/… or GraphQL enum) |
| `get_spot_deltas` | token + timeframe |
| `get_orderbook_snapshot_filtered` | prefer ETH / narrow bands (wide BTC may 500) |
| `list_perp_rfq_markets` | RFQ-enabled symbols |
| `list_spot_ticker_positions` | top spot holders |

### Trader deep-dive

| Tool | Notes |
| --- | --- |
| `get_trader_best_trades` | best completed trades |
| `get_trader_stats_per_asset` | per-coin stats |
| `get_trader_detailed_stats` | duration / streak / PnL summary |
| `list_trader_completed_trades` | paginated trades |
| `get_traders` | batch by `addresses[]` |
| `list_system_group_traders` | `tagged` \| `copytraders` \| `equities` \| `btc` \| `hype` \| `cl` |
| `get_group` | group metadata + wallets |
| `get_trader_perp_positions_at` | snapshot at epoch ms |

### Widgets

| Tool | Notes |
| --- | --- |
| `get_widget` | `type` enum + optional `params`; empty params auto-nest camelCase key |

Widget types: `OI_SURGES`, `IMMINENT_LIQUIDATIONS`, `FUNDING_RATES`, `SMART_MONEY_FLIPS`, `CVD`, `TOP_UPNL_CHANGES`, `LARGEST_OPENED_TRADES`, `NET_TWAP_PRESSURE`, `ASSET_RETURNS`, `TOP_PERP_UNREALIZED_PNL`, `TOP_PERP_POSITIONS`, `FRESH_WALLET_POSITIONS`, `WHALE_DEPOSITS`, `TOP_TWAPS`, `LIQUIDATION_FEED`, `OPEN_INTEREST`, `USER_GROWTH`, `AF_BUYBACKS`, `PERP_PRICE_CHANGES`, `NET_POSITIONING`.

`SMART_MONEY_FLIPS` needs `{ coin }`; `CVD` needs `{ market }`.

## License

MIT
