#!/usr/bin/env node
// Zero-dep stdio smoke test for server/index.mjs.
// 1. Protocol: initialize, tools/list (count matches README, annotations, described properties).
// 2. Bad-arg cases from fixtures.json return isError text with the expected hint.
// 3. Mock upstream: paging + size cap, no structuredContent arrays, error hints, timeout, stdin-close drain.
// 4. Live: every tool with fixture args against the real API (skipped when offline or SMOKE_OFFLINE=1).
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(ROOT, "server", "index.mjs");
const FIXTURES = JSON.parse(readFileSync(join(ROOT, "test", "fixtures.json"), "utf8"));
const LIVE_BASE = (process.env.HYPERDASH_API_URL || "https://api.hyperdash.com").replace(/\/$/, "");
const MAX_CHARS = 40000;
const REQUEST_TIMEOUT_MS = 60000;

const failures = [];
let passed = 0;
function check(cond, label, detail = "") {
  if (cond) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ""}`);
  return cond;
}
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function startServer(env = {}) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const waiters = new Map();
  let buf = "";
  let nextId = 1;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        check(false, "stdout carries only JSON-RPC lines", line.slice(0, 200));
        continue;
      }
      waiters.get(msg.id)?.(msg);
      waiters.delete(msg.id);
    }
  });
  const closed = new Promise((resolve) => child.on("close", resolve));
  const request = (method, params) => {
    const id = nextId++;
    const reply = new Promise((resolve) => waiters.set(id, resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ id, error: { message: `no reply in ${REQUEST_TIMEOUT_MS}ms` } }), REQUEST_TIMEOUT_MS).unref()
    );
    return Promise.race([reply, timeout]);
  };
  return {
    request,
    call: (name, args = {}) => request("tools/call", { name, arguments: args }),
    close: () => {
      child.stdin.end();
      return closed;
    },
  };
}

// Returns {text, parsed, isError} after asserting the result shape every client accepts.
function inspect(label, res) {
  if (!check(!res.error, label, `JSON-RPC error ${JSON.stringify(res.error)}`)) return {};
  const r = res.result;
  if ("structuredContent" in r) {
    check(isPlainObject(r.structuredContent), label, "structuredContent must be a plain object");
  }
  const text = r.content?.[0]?.text;
  if (!check(typeof text === "string", label, "missing content[0].text")) return {};
  check(text.length <= MAX_CHARS, label, `text is ${text.length} chars (> ${MAX_CHARS})`);
  let parsed;
  if (!r.isError) {
    try {
      parsed = JSON.parse(text);
    } catch {
      check(false, label, "text is not JSON");
    }
  }
  return { text, parsed, isError: Boolean(r.isError) };
}

async function protocolChecks() {
  const s = startServer({ HYPERDASH_API_URL: "http://127.0.0.1:9" });
  const init = await s.request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
  check(init.result?.protocolVersion === "2025-06-18", "initialize echoes protocolVersion");
  const instructions = init.result?.instructions ?? "";
  check(instructions.length > 0 && instructions.length < 600, "initialize instructions < 600 chars", `${instructions.length}`);
  const old = await s.request("initialize", { protocolVersion: "1999-01-01" });
  check(old.result?.protocolVersion === "2025-06-18", "initialize falls back to latest protocol");

  const tools = (await s.request("tools/list", {})).result?.tools ?? [];
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const heading = Number(readme.match(/## MCP tools \((\d+)\)/)?.[1]);
  check(tools.length === heading, "tool count matches README heading", `${tools.length} vs ${heading}`);
  for (const t of tools) check(readme.includes(`\`${t.name}\``), `README lists ${t.name}`);
  for (const t of tools) {
    check(t.annotations?.readOnlyHint === true && t.annotations?.openWorldHint === true, `${t.name} annotations`);
    check(typeof t.title === "string" && t.title.length > 0, `${t.name} title`);
    check(/^Use /.test(t.description), `${t.name} description leads with "Use"`);
    for (const [key, prop] of Object.entries(t.inputSchema.properties ?? {})) {
      check(Boolean(prop.description || prop.enum), `${t.name}.${key} has description or enum`);
    }
  }
  const names = new Set(tools.map((t) => t.name));
  for (const name of names) check(name in FIXTURES.calls, `fixture covers ${name}`);
  for (const name of Object.keys(FIXTURES.calls)) check(names.has(name), `fixture ${name} is a real tool`);

  const unknown = await s.call("no_such_tool");
  check(unknown.error?.code === -32602, "unknown tool is JSON-RPC error -32602", JSON.stringify(unknown.error));

  await errorCases(s, FIXTURES.errors.filter((c) => !c.network));
  await s.close();
  return tools;
}

// Bad-arg cases: the agent-visible text must carry the expected reason or hint.
async function errorCases(s, cases) {
  for (const { tool, args, expect } of cases) {
    const label = `bad args ${tool} ${JSON.stringify(args)}`;
    const { text, isError } = inspect(label, await s.call(tool, args));
    check(isError && text?.includes(expect), label, `expected isError containing "${expect}", got ${JSON.stringify(text)}`);
  }
}

function startMock() {
  const seen = {};
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status, payload) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      // Slow health answer: the stdin-close check needs a request still in flight.
      if (req.method === "GET") return setTimeout(() => send(200, { status: "healthy" }), 200);
      const { query, variables } = JSON.parse(body || "{}");
      if (query.includes("newsItems")) return; // never answer: exercises the fetch timeout
      if (query.includes("getTrader(")) {
        return send(400, {
          errors: [{ message: 'Cannot query field "gone" on type "TraderExplore".', extensions: { code: "GRAPHQL_VALIDATION_FAILED" } }],
        });
      }
      if (query.includes("recentLiquidations")) {
        const rows = Array.from({ length: 3000 }, (_, i) => ({
          id: String(i),
          address: `0x${String(i).padStart(40, "0")}`,
          coin: i % 3 ? "BTC" : "ETH",
          px: "100000.0",
          sz: "1.0",
          side: "A",
          time: 1700000000000 - i,
          dir: "Close Long",
          closedPnl: "-10.5",
          hash: `0x${"ab".repeat(32)}`,
        }));
        return send(200, { data: { recentLiquidations: rows } });
      }
      if (query.includes("perpRfqMarkets")) return send(200, { data: { perpRfqMarkets: ["xyz:AAPL", "xyz:TSLA"] } });
      if (query.includes("assetPriceChanges")) {
        return send(200, { data: { assetPriceChanges: [{ coin: "SOL", price: 100 }, { coin: "BTC", price: 50000 }] } });
      }
      if (query.includes("liquidationLevelsV2")) {
        seen.levels = variables;
        const bands = Array.from({ length: 300 }, (_, i) => ({
          minPrice: 85 + i * 0.1,
          maxPrice: 85.1 + i * 0.1,
          historicalData: i % 10 ? [] : [{ timestamp: 1, totalAmount: 5 }],
        }));
        return send(200, {
          data: { analytics: { liquidationLevels: { coin: "SOL", currentPrice: 100, bandSize: 0.1, bands } } },
        });
      }
      return send(500, { errors: [{ message: "Internal server error", extensions: { code: "INTERNAL_SERVER_ERROR" } }] });
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` }))
  );
}

async function mockChecks() {
  const mock = await startMock();
  const s = startServer({ HYPERDASH_API_URL: mock.url, HYPERDASH_TIMEOUT_MS: "300" });

  const first = inspect("mock get_recent_liquidations", await s.call("get_recent_liquidations", { limit: 500 }));
  const page = first.parsed;
  check(isPlainObject(page), "list result is an object, not an array");
  check(page?.total === 3000 && page?.truncated === true, "list reports total and truncated", JSON.stringify({ total: page?.total, truncated: page?.truncated }));
  check(Number.isInteger(page?.next_offset) && page.next_offset === page.returned, "truncated list returns next_offset");
  check(typeof page?.hint === "string", "truncated list returns a hint");
  const second = inspect("mock page 2", await s.call("get_recent_liquidations", { offset: page?.next_offset ?? 0, limit: 5 }));
  check(second.parsed?.offset === page?.next_offset && second.parsed?.returned === 5, "offset pages forward");
  const eth = inspect("mock coin filter", await s.call("get_recent_liquidations", { coin: "eth", limit: 5 })).parsed;
  check(eth?.total === 1000 && eth.items.every((r) => r.coin === "ETH"), "coin filter applies before paging");
  const defaults = inspect("mock default limit", await s.call("get_recent_liquidations", {})).parsed;
  check(defaults?.returned === 50, "default limit is 50", `${defaults?.returned}`);

  const rfq = inspect("mock list_perp_rfq_markets", await s.call("list_perp_rfq_markets", {})).parsed;
  check(rfq?.total === 2 && rfq.truncated === false && !("next_offset" in rfq), "short list has no next_offset");

  const levels = inspect("mock get_liquidation_levels", await s.call("get_liquidation_levels", { coin: "SOL" })).parsed;
  const v = mock.seen.levels ?? {};
  check(Math.abs(v.minPrice - 85) < 1e-6 && Math.abs(v.maxPrice - 115) < 1e-6, "default band is mark ±15%", JSON.stringify(v));
  check(levels?.total === 30 && levels.items.every((b) => b.historicalData.length > 0), "empty bands dropped", `${levels?.total}`);

  const drift = inspect("mock schema drift", await s.call("get_trader", { address: `0x${"a".repeat(40)}` }));
  check(drift.isError && drift.text.includes("Cannot query field") && drift.text.includes("Hint:"), "GraphQL validation error surfaces reason + hint", drift.text);

  const coinErr = inspect("mock upstream 500", await s.call("get_asset_top_traders", { coin: "NOTACOIN" }));
  check(coinErr.isError && coinErr.text.includes("Internal server error") && coinErr.text.includes("coin name"), "upstream 500 surfaces body + coin hint", coinErr.text);

  const slow = inspect("mock timeout", await s.call("get_news", {}));
  check(slow.isError && slow.text.includes("timed out"), "fetch timeout returns isError", slow.text);

  // Response for an in-flight request must arrive even when stdin closes right after it.
  const inflight = s.call("get_health", {});
  await s.close();
  const health = await Promise.race([inflight, new Promise((r) => setTimeout(() => r({ error: "dropped" }), 2000))]);
  check(!health.error && health.result && !health.result.isError, "in-flight request answered after stdin close");

  mock.server.closeAllConnections?.();
  mock.server.close();
}

async function online() {
  if (process.env.SMOKE_OFFLINE === "1") return false;
  try {
    const res = await fetch(`${LIVE_BASE}/health`, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

function resolveArgs(value, marks) {
  if (Array.isArray(value)) return value.map((v) => resolveArgs(v, marks));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveArgs(v, marks)]));
  if (typeof value !== "string") return value;
  const now = value.match(/^\{\{now-(\d+)\}\}$/);
  if (now) return Date.now() - Number(now[1]);
  const mark = value.match(/^\{\{mark:([^*]+)\*([\d.]+)\}\}$/);
  if (mark) return Number((marks[mark[1]] * Number(mark[2])).toFixed(2));
  return value;
}

async function liveChecks() {
  const s = startServer({ HYPERDASH_API_URL: LIVE_BASE });
  await s.request("initialize", { protocolVersion: "2025-06-18" });
  const markRes = inspect("live mark lookup", await s.call("list_asset_price_changes", { coins: ["ETH"] }));
  const marks = Object.fromEntries((markRes.parsed?.items ?? []).map((r) => [r.coin, Number(r.price)]));

  const jobs = [];
  for (const [tool, spec] of Object.entries(FIXTURES.calls)) {
    for (const args of Array.isArray(spec) ? spec : [spec]) jobs.push({ tool, args: resolveArgs(args, marks) });
  }
  const results = [];
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const job = queue.shift();
        results.push({ ...job, res: await s.call(job.tool, job.args) });
      }
    })
  );
  for (const { tool, args, res } of results) {
    const label = `live ${tool} ${JSON.stringify(args)}`;
    const { text, parsed, isError } = inspect(label, res);
    if (text === undefined) continue;
    const drift = /GRAPHQL_VALIDATION_FAILED|Cannot query field/.test(text);
    check(!isError, drift ? `${label} SCHEMA DRIFT` : label, isError ? text.slice(0, 400) : "");
    if (tool === "get_trader" && !isError) check(isPlainObject(parsed) && parsed.address, "get_trader returns an object");
    if (tool === "get_widget" && !isError) check(!parsed?.error, `${label} widget error`, String(parsed?.error));
  }
  await errorCases(s, FIXTURES.errors.filter((c) => c.network));
  await s.close();
  return results.length;
}

const tools = await protocolChecks();
await mockChecks();
let liveNote = "live: skipped (offline or SMOKE_OFFLINE=1)";
if (await online()) liveNote = `live: ${await liveChecks()} calls`;

console.log(`tools=${tools.length} checks passed=${passed} failed=${failures.length}; ${liveNote}`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
