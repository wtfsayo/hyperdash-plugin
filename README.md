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
| `NewsItem` | headline + source (+ optional enrichment) |
| `TwapOrder` | active TWAP clip |
| `FundingHistory` | raw analytics.historicalFundingRates payload |

## Install

Copy to `~/.cursor/plugins/local/hyperdash-info`, Reload Window.

## MCP tools

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

## License

MIT
