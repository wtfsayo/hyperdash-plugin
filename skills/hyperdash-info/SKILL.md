---
name: hyperdash-info
description: >-
  Use when reading Hyperdash/Hyperliquid terminal intel — asset movers, trader
  explore/stats/best trades, liquidations & levels, perp/spot deltas, spot
  holders, OI, funding, TWAPs, RFQ markets, or dashboard widgets (OI surges,
  imminent liqs, CVD, smart-money flips, etc). Call MCP tools; never invent
  prices. Does not place orders.
---
# hyperdash-info

Public GraphQL at `https://api.hyperdash.com/graphql`. No auth for these reads.

## Tools

| Need | Tool |
| --- | --- |
| API up? | `get_health` |
| 24h/7d/30d movers + OI | `list_asset_price_changes` |
| Trader leaderboard | `explore_traders` (`timeframe` required) |
| One wallet card | `get_trader` |
| Batch wallet cards | `get_traders` |
| System cohort (tagged/btc/…) | `list_system_group_traders` |
| Group metadata | `get_group` |
| Biggest uPnL on a coin | `get_asset_top_traders` |
| Best completed trades | `get_trader_best_trades` |
| Per-coin trader stats | `get_trader_stats_per_asset` |
| Duration / streak summary | `get_trader_detailed_stats` |
| Paginated completed trades | `list_trader_completed_trades` |
| Positions at a timestamp | `get_trader_perp_positions_at` |
| Liq tape | `get_recent_liquidations` |
| Liq totals by market | `list_liquidation_totals` |
| Liq heatmap bands | `get_liquidation_levels` |
| Top liq clusters now | `get_current_top_liquidations` |
| Perp size deltas | `get_perp_deltas` |
| Spot balance deltas | `get_spot_deltas` |
| Spot top holders | `list_spot_ticker_positions` |
| Historical OI | `get_historical_open_interest` |
| Cohort participation | `get_perps_market_participation` |
| Resting orderbook band | `get_orderbook_snapshot_filtered` (ETH / narrow safer) |
| RFQ markets | `list_perp_rfq_markets` |
| News | `get_news` |
| Active TWAPs | `get_current_twaps` |
| Funding history | `get_historical_funding_rates` |
| Dashboard widget | `get_widget` (`type` + optional `params`) |

### Widget types (via `get_widget`)

`OI_SURGES`, `IMMINENT_LIQUIDATIONS`, `FUNDING_RATES`, `SMART_MONEY_FLIPS` (needs `coin`), `CVD` (needs `market`), `TOP_UPNL_CHANGES`, `LARGEST_OPENED_TRADES`, `NET_TWAP_PRESSURE`, `ASSET_RETURNS`, `TOP_PERP_UNREALIZED_PNL`, `TOP_PERP_POSITIONS`, `FRESH_WALLET_POSITIONS`, `WHALE_DEPOSITS`, `TOP_TWAPS`, `LIQUIDATION_FEED`, `OPEN_INTEREST`, `USER_GROWTH`, `AF_BUYBACKS`, `PERP_PRICE_CHANGES`, `NET_POSITIONING`.

Empty `params` auto-builds nested camelCase key (`OI_SURGES` → `{ oiSurges: {} }`).

## Rules

- Prefer thesis framing: tape / relative strength / crowding / invalidation.
- `xyz:` coins are HIP-3 RWA perps (stocks, indices, commodities).
- Delta timeframes: `15m` \| `1h` \| `4h` \| `24h` \| `3d` \| `7d` (or GraphQL enums).
- System groups: `tagged` \| `copytraders` \| `equities` \| `btc` \| `hype` \| `cl`.
- Never call CreateOrder / strategy mutations from this plugin.
- Docs OpenAPI plant-store stub is not the real API — use these tools.
