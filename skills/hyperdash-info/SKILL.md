---
name: hyperdash-info
description: >-
  Use when reading Hyperdash/Hyperliquid terminal intel — asset movers, trader
  explore/leaderboard, liquidations, news, top positions, TWAPs, or funding
  history. Call MCP tools; never invent prices. Does not place orders.
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
| Biggest uPnL on a coin | `get_asset_top_traders` |
| Liq tape | `get_recent_liquidations` |
| News | `get_news` |
| Active TWAPs | `get_current_twaps` |
| Funding history | `get_historical_funding_rates` |

## Rules

- Prefer thesis framing: tape / relative strength / crowding / invalidation.
- `xyz:` coins are HIP-3 RWA perps (stocks, indices, commodities).
- Never call CreateOrder / strategy mutations from this plugin.
- Docs OpenAPI plant-store stub is not the real API — use these tools.
