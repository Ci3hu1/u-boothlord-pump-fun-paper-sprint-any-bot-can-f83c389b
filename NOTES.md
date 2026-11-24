# NOTES.md — Tide Anchor build record

## Bounty

- Pump.fun Paper Sprint: Any Bot Can Win
- Slug: `u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b`
- Prize: $2 winner-takes-all. Free entry, no prerequisites.
- Closes: 26 Nov 2026 12:40 WIB (05:40 UTC). Results: 18 Dec 2026 (per
  requirements: result due 10 Dec 2026 11:40 UTC).
- Harness: pumpfun-replay/v2, main.ts on Node 22. 10 SOL capital, max 5 open
  positions, buys capped at 1% of a curve's real SOL reserve, max 16 orders
  per batch, 2-slot latency, fees 95 + 30 bps + 0.000105 SOL per order,
  2% failed-tx rate. Guardrails: ≥20 coins with ≥0.01 SOL round trips,
  max drawdown ≤50%.

## Build

- Built 24 Nov 2026 ~13:0x WIB in a fresh session after opening
  (opened 24 Nov 2026 05:37:28 UTC).
- Kit: fresh download 24 Nov 2026, kit level 40
  (`u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b-kit`,
  bundle sha256 `28dd76e484378fff665a86f49572c947b23da359cfc1fdb59ed5130e67a68ac1`
  per competition.yaml).
- Strategy: Tide Anchor — buy young curves as soon as liquid (age 5–300
  slots, ≥2 distinct buyers, positive net flow, no surge filter), one buy
  per coin up to 0.25 SOL, hold long (sell only a doubler, a halving, a
  whale dump, or a 200000-slot time box), 4 main slots + 1 reserved probe
  slot for the guardrails. Own design, different from the sibling Burst
  Rider entry (old-curve momentum + scale-ins); the kit's
  `vendor/makefun-bot.ts` shim is a byte-identical copy of the kit SDK
  file, as the kit instructs. Local sweep v1 → v3c in STRATEGY.md;
  shipped v3c grades −0.374 SOL on the dev window with 42 coins and
  0.042 max drawdown.
- Tests: 8/8 pass (`node --test tests/determinism.test.ts
  tests/strategy.test.ts`): byte-identical replies over two runs, entry buy
  capped at 1% of real reserves, no buy when too old / flow all sells,
  take-profit (+100%) / hard-stop (−50%) / time-box sells, no sell inside
  the bands.
- Revision: after the first test run, 2 "no buy" tests failed because the
  guardrail probe fired at pace ≈ 0 in the first minutes; the probe floor
  (no probes before 5% of the window) was added and all 8 tests pass.

## Grade-local (dev window, --driver process)

Local sweep, all on the 24h dev window (2–3 Nov 2026, 1,222 coins,
128,058 events):

- v1 (surge-chase, wide exits): −4.741 SOL, 561 coins, drawdown 0.497,
  result `de5389da38784ff8b838b162256fbe955e86cd310bec53bb486980f7b6922867`.
- v2 (tighter surge, tight stops): −3.672 SOL, 448 coins, drawdown 0.375,
  result `aaac5b12182c1d18377a5457eb15f0f27ffa916d7df4275330c5f0af9f3324f9`.
- v3 (buy-young-hold-long, 5 mains): −0.354 SOL, 27 coins, drawdown 0.044,
  result `e78e61614659612ced07bd2ce4d9bcb70cd8f6ddf77ac33817e507d4b3708af4`.
- v3b (v3 + probe slot + 54000-slot hold): −1.252 SOL, 76 coins,
  drawdown 0.129, result
  `dd65fb0cec2493da4152d3137362da584b8f3072dc6f903d5ecffc0657dd1048`.
- v3c (SHIPPED: v3 + probe slot, 200000-slot hold): −0.374 SOL
  (return −0.0374, 90% interval −0.699..−0.127 SOL), 112 fills over
  42 coins, 58 round trips, win rate 0.069, max drawdown 0.042,
  guardrails met (42 coins ≥0.01 SOL round trips, drawdown ok),
  fees 0.027 SOL curve + 0.012 SOL tx; at 2x fees −0.409 SOL.
  Action log `a27be851701054027f2e0d4e1d9e0e5357000031377dfd4adcee183ad48eacf3`,
  result `23395aa5469f26e8099dd2116ba5cdd44bb82ea01112fba4db2d9d9603d18c66`
  (process driver; the server runs Node v26.13.1 in docker, so its sha
  differs). L1 regrade reproduced byte for byte on v1; determinism holds
  by construction (no clock, no randomness, no environment).
- House pilots on the same window: momentum −9.489, reversion −3.995,
  sniper −0.475, equal-weight −0.019, hold-cash 0.000 SOL.

## Kit check

- 24 Nov 2026 ~13:34 WIB on commit 570eeff: ok=true, failed=[] (reproduces 509/822 = 61.9%, revised pass via strategy.ts from 5 messages). Bundle sha256 b1387995e8f9f1af4dcf36f90224c77b15f22db2d6623353a0706644592275c9 (292,508 B; sessions 7689887a + 338680f8, 2 usage rows).

## Live score

- SUBMITTED 24 Nov 2026 ~13:34 WIB: submission 01a20c43-3c84-75c1-ab21-43351cbeeb42, stage submitted (grading queue behind at submit; check again in 5 min). Entry commit 570eeff1567de0255ae48efcfdb371cf508d8e9a. No blind rounds; closes 26 Nov 12:40 WIB.
