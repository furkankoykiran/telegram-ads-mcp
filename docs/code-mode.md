# Code Mode

Code Mode lets an agent run one short JavaScript program against the Telegram Ads API instead of
making dozens of individual tool calls. It is useful for pagination, joins, bulk inspection and
compact reports.

It is optional. The 24 regular tools cover everyday work and are easier to audit. Use Code Mode when
the shape of the task is a loop or a report, not a single call.

## Enabling it

Code Mode is enabled by default in **read-only** mode:

```bash
TG_ADS_CODE_MODE=read-only
```

To allow writes inside a script, all three conditions must hold:

```bash
TG_ADS_MODE=write
TG_ADS_CODE_MODE=write
```

and the `tg_execute` call must include `confirm: true`.

Set `TG_ADS_CODE_MODE=off` to remove the tool entirely for unattended agents.

## Writing a script

`tg_execute` accepts three shapes:

```js
// 1. A plain statement body
const account = await tg.getCurrentAccount();
return account.currency;
```

```js
// 2. An async arrow function
async () => {
  const ads = await tg.getAdsList({ limit: 100 });
  return ads.ads.length;
};
```

```js
// 3. A function expression
async function () {
  return await tg.getCurrentAccount();
}
```

The body runs inside an async function, so top-level `await` and `return` work. The returned value
must be JSON-serializable.

Every method in the official API is available on `tg` with the same name and parameters. Call
`tg_get_sdk` to get TypeScript declarations, or `tg_search` to find a method:

```js
const matches = await tg.getAdsById({ ad_ids: [123] });
return matches;
```

## Examples

### Paginate through every ad

```js
const all = [];
let offset;
do {
  const page = await tg.getAdsList({ limit: 100, offset });
  all.push(...page.ads);
  offset = page.next_offset;
} while (offset);

return {
  total: all.length,
  active: all.filter((ad) => ad.status === "active").length,
  paused: all.filter((ad) => ad.is_paused).length,
};
```

### Find the most expensive active ads

```js
const { ads } = await tg.getAdsList({ limit: 100 });
return ads
  .filter((ad) => ad.status === "active")
  .sort((a, b) => b.cpm - a.cpm)
  .slice(0, 10)
  .map((ad) => ({ id: ad.ad_id, title: ad.title, cpm: ad.cpm, budget: ad.budget }));
```

### Combine account and ad statistics

```js
const now = Math.floor(Date.now() / 1000);
const from = now - 7 * 86400;

const [account, ads] = await Promise.all([
  tg.getAccountStats({ from_time: from, to_time: now, interval: 86400 }),
  tg.getAdsList({ limit: 100 }),
]);

const totals = account.reduce(
  (acc, item) => ({
    views: acc.views + item.views,
    opens: acc.opens + item.opens,
    spent: acc.spent + item.spent,
  }),
  { views: 0, opens: 0, spent: 0 },
);

return {
  currency: (await tg.getCurrentAccount()).currency,
  ads: ads.ads.length,
  totals,
  ctr: totals.views ? (totals.opens / totals.views) * 100 : 0,
};
```

### Bulk pause with a guard

Writes require `confirm: true` and a write-enabled server. Keep the selection explicit and return
what changed:

```js
const { ads } = await tg.getAdsList({ limit: 100 });
const targets = ads.filter((ad) => ad.status === "active" && ad.cpm > 2);

for (const ad of targets) {
  await tg.editAd({ ad_id: ad.ad_id, is_paused: true });
}

return targets.map((ad) => ad.ad_id);
```

Prefer `tg_update_ad` for a single ad: it validates the payload and supports `dry_run`.

## Limits

| Limit             | Value             |
| ----------------- | ----------------- |
| API calls per run | 25                |
| Wall-clock time   | 15 seconds        |
| QuickJS memory    | 64 MB             |
| Returned result   | 64 KB             |
| Console entries   | 200               |
| Script length     | 20,000 characters |

Calls run **sequentially**, in script order. A script cannot burst the API or run calls in parallel.
If a call fails, the promise rejects and the script can catch it:

```js
try {
  return await tg.getAdsById({ ad_ids: [999999] });
} catch (error) {
  return { failed: String(error) };
}
```

## Security model

`tg_execute` runs in [QuickJS](https://bellard.org/quickjs/) compiled to WebAssembly, not in Node.
The sandbox has:

- no `fetch`, `WebSocket`, `require`, `import`, `process`, `fs` or environment access,
- no timers, `eval` of host code, or access to the host global object,
- only `tg` and a small `console` shim,
- a memory cap, a stack cap, an interrupt handler for the deadline and a call counter.

The host bridges each `tg` call back through deferred promises and resolves them one at a time. This
is deliberately stricter than running generated code in the main process.

Code Mode is defense in depth, not a replacement for the write policy. Writes still need
`TG_ADS_MODE=write`, `TG_ADS_CODE_MODE=write` and `confirm: true`, and they still pass through the
account allowlist, budget caps, idempotency keys and audit log.

## When not to use it

- A single read or write: call the dedicated tool.
- Anything that needs a secret other than the configured token.
- Long-running jobs: the limit is 15 seconds; split the work or use the regular tools.
- Work that must be reviewed step by step: individual tool calls are easier to inspect.

## Troubleshooting

| Error                                          | Cause                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `Code Mode is disabled`                        | Set `TG_ADS_CODE_MODE=read-only` or `write` and restart the client.              |
| `changes state, but Code Mode is read-only`    | Set `TG_ADS_MODE=write` and `TG_ADS_CODE_MODE=write`, then pass `confirm: true`. |
| `Call limit reached (25)`                      | Reduce the number of calls or move the loop into the regular tools.              |
| `Execution exceeded the 15000 ms limit`        | The script or an API call took too long. Narrow the range.                       |
| `Result is ... bytes`                          | Aggregate or filter inside the script and return a smaller object.               |
| `Script returned a promise that never settled` | A promise was created but never awaited or resolved.                             |
