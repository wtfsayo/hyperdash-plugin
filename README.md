# hyperdash-info

Cursor / Agent Plugin for **Hyperdash** public market intel (Hyperliquid terminal).

- REST: `GET https://api.hyperdash.com/health`
- GraphQL: `POST https://api.hyperdash.com/graphql` (introspection disabled; operations reverse-mapped from the web app, so upstream schema changes can break a tool; the daily CI run catches them)

Read-only. No order / strategy / wallet mutations.

Site: https://hyperdash.com · Docs: https://docs.hyperdash.com (product docs; published OpenAPI there is currently a Mintlify placeholder)

## Results

- Every result is compact JSON in `content[0].text`; there is no `structuredContent`.
- List tools take `limit` (default 50 unless the tool says otherwise, max 500) and `offset`, and return `{ total, returned, offset, next_offset, truncated, items, hint }`. `next_offset` and `hint` appear only when more rows remain.
- Every result stays under 40,000 characters. A list that would exceed it is cut short and marked `truncated`; any other result over the cap returns an error asking for narrower arguments.
- Tool failures come back as `isError` results whose text carries the upstream reason and a hint (bad address, bad enum, timeout, schema drift). JSON-RPC errors are reserved for unknown methods and tools.
- `label`, `displayName`, `twitter`, group names and news text are third-party content; affected results carry a `note` saying so.

## Install (Cursor IDE)

Copy to `~/.cursor/plugins/local/hyperdash-info`, Reload Window.

## Install (Claude Code)

Clone this repo, then start Claude Code with `claude --plugin-dir /path/to/hyperdash-plugin`. `.claude-plugin/plugin.json` loads the skill and starts the MCP server with `node ${CLAUDE_PLUGIN_ROOT}/server/index.mjs`. The server has no dependencies, so it needs only Node on `PATH` and no `npm install`.

Environment:

| Variable | Default | Effect |
| --- | --- | --- |
| `HYPERDASH_API_URL` | `https://api.hyperdash.com` | API host. In Claude Code, export it before launch; in Cursor, edit `mcp.json`. |
| `HYPERDASH_TIMEOUT_MS` | `15000` | Per-request upstream timeout. |

## MCP tools (28)

tools/list carries the full schemas. Summary:

### Market

| Tool | Notes |
| --- | --- |
| `get_health` | REST `/health`, falls back to `/` on an HTTP error |
| `list_asset_price_changes` | movers incl. `xyz:*` HIP-3; `coins` filter |
| `get_recent_liquidations` | liq tape; `coin` filter |
| `get_news` | headlines; `include_body` for article text |
| `get_current_twaps` | `market`, `type` (`perp` \| `spot`) |
| `get_historical_funding_rates` | `tokens[]`, `timeframe` `7d` \| `30d` |
| `get_historical_open_interest` | `tokens[]`, `timeframe` `7d` \| `30d` |
| `get_perps_market_participation` | global + size/PnL cohorts; `coins` filter, max 15 coins |
| `list_perp_rfq_markets` | RFQ-enabled symbols |

### Liquidations

| Tool | Notes |
| --- | --- |
| `list_liquidation_totals` | per-market aggregates (`windowHours`) |
| `get_liquidation_levels` | heatmap bands; default band mark ±15% over 24h; empty bands dropped |
| `get_current_top_liquidations` | top long/short clusters; default band mark ±15% |

### Deltas & orderbook

| Tool | Notes |
| --- | --- |
| `get_perp_deltas` | `market`, `timeframe` `15m` \| `1h` \| `4h` \| `24h` \| `3d` \| `7d`; sorted by \|delta\| |
| `get_spot_deltas` | `token`, same timeframes |
| `get_orderbook_snapshot_filtered` | resting orders in a band; keep bands narrow (wide BTC bands fail upstream) |
| `list_spot_ticker_positions` | top spot holders |

### Traders

| Tool | Notes |
| --- | --- |
| `explore_traders` | leaderboard; `timeframe` `one_day` \| `seven_days` \| `thirty_days` \| `all` |
| `get_trader` | one wallet |
| `get_traders` | batch by `addresses[]`; `include_graph` for `portfolioGraph` |
| `get_asset_top_traders` | top unrealized PnL on a coin |
| `get_trader_best_trades` | best completed trades |
| `get_trader_stats_per_asset` | per-coin stats |
| `get_trader_detailed_stats` | duration / streak / PnL summary |
| `list_trader_completed_trades` | `page` / `pageSize` (max 50) |
| `get_trader_perp_positions_at` | snapshot at epoch ms |
| `list_system_group_traders` | `tagged` \| `copytraders` \| `equities` \| `btc` \| `hype` \| `cl`; `include_graph` |
| `get_group` | group metadata + wallets |

### Widgets

| Tool | Notes |
| --- | --- |
| `get_widget` | `type` enum + optional `params`; empty params auto-nest the camelCase key (`OI_SURGES` → `{ oiSurges: {} }`) |

Widget types: `OI_SURGES`, `IMMINENT_LIQUIDATIONS`, `FUNDING_RATES`, `SMART_MONEY_FLIPS`, `CVD`, `TOP_UPNL_CHANGES`, `LARGEST_OPENED_TRADES`, `NET_TWAP_PRESSURE`, `ASSET_RETURNS`, `TOP_PERP_UNREALIZED_PNL`, `TOP_PERP_POSITIONS`, `FRESH_WALLET_POSITIONS`, `WHALE_DEPOSITS`, `TOP_TWAPS`, `LIQUIDATION_FEED`, `OPEN_INTEREST`, `USER_GROWTH`, `AF_BUYBACKS`, `PERP_PRICE_CHANGES`, `NET_POSITIONING`.

## Testing

`npm test` runs `test/smoke.mjs` (zero dependencies). It checks the protocol and tool metadata, bad-argument errors, paging and size caps against a local mock, the fetch timeout, and the stdin-close drain. When the API is reachable it also calls every tool and widget with `test/fixtures.json` and fails on any error or schema drift. Set `SMOKE_OFFLINE=1` to skip the live calls. CI runs it on every push and daily.

## License

MIT
