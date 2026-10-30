---
name: hyperdash-info
description: >-
  Hyperdash intel on Hyperliquid: liquidations, whale and trader wallets,
  leaderboards, position deltas, OI and funding history, TWAPs, dashboard
  widgets. Read-only.
---
# hyperdash-info

tools/list is the reference for tools and arguments.

## IDs

- Coins use Hyperliquid names (`BTC`, `HYPE`). HIP-3 perps carry a dex prefix (`xyz:NVDA`). Spot tools take the token (`HYPE`).
- Wallets are 0x-prefixed 40-hex addresses. Find them with `explore_traders`, `get_asset_top_traders` or `list_system_group_traders`, then open them with the `get_trader*` tools.

## Size

- Pass `coin`, `coins` or `limit` on every call.
- Lists return `{total, returned, truncated, next_offset, items}`. When `truncated` is true, call again with `offset=next_offset` or narrow the filter.
- Request `include_graph` or `include_body` only when the answer needs the series or article text.

## Done when

Every number in the answer comes from a tool result in this session and names its coin, window and timestamp. Frame findings as a thesis: tape, relative strength, crowding, invalidation.
