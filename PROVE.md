# Prove — hyperdash-info 0.2.0

- Schema: plugin.json + mcp.json PASS (agent-plugins 1.0.0)
- MCP live: **32/32 PASS** (initialize 0.2.0, tools/list=28, all 9 legacy + sample of 19 new including widgets `OI_SURGES`/`IMMINENT_LIQUIDATIONS`/`CVD`, `get_perp_deltas` BTC, `list_liquidation_totals`, `get_liquidation_levels` BTC)
- New tools wired: liquidation totals/levels/top, perp+spot deltas, trader best/stats/completed/batch/groups, historical OI, market participation, spot holders, orderbook band, positions-at, RFQ markets, flexible `get_widget`
- Widget note: per-type inline fragments (mega-union fails GraphQL nullability conflicts across types)
- Local install: `~/.cursor/plugins/local/hyperdash-info` (real dir copy)
- Real use (0.1): ZEC crowded melt-up vs PONS long wipeout — see THESIS.md
