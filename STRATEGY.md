# STRATEGY.md — Tide Anchor

## Edge

On a 6-hour pump.fun window the first wave is the trade — and the dev
window's lesson is that chasing it after it has already surged is buying
high. Tide Anchor buys young curves as soon as they are liquid (5–300 slots
after creation, ≥2 distinct buyers, positive net flow) with no surge filter,
buys each coin once, in size, and then holds it long: sell only a doubler, a
halving, a whale dump, or the time box. One buy and one sell per coin keeps
the fee bill minimal: every round trip pays 1.25% in curve fees plus
0.000105 SOL in tx fees, so frequent trading is a guaranteed bleed on this
harness. The house pilots prove it on the same dev window: momentum −9.489
SOL, reversion −3.995 SOL, sniper −0.475 SOL, equal-weight −0.019 SOL,
hold-cash 0.000 SOL. Tide Anchor is the closest shape to the two least-bad
pilots (equal-weight and hold-cash) with exits added for the rare runner and
the rare disaster.

The second edge is rotation, not prediction. Four main slots recycle through
fresh curves for the whole window while a fifth slot is reserved for tiny
probe round trips, which is what clears the guardrail (a ≥0.01 SOL round trip
on ≥20 coins, max drawdown ≤50%) even on a 6h final window where few curves
complete. No scale-ins, no re-entries into a cooling curve, no chasing: a
coin that does not show early buyers is never bought, and a coin that is
sold is bought at most once per run.

## Entry rules

- Age 5–300 slots after the CreateEvent (first-seen trade if no CreateEvent).
- No price-rise requirement: the creation price is recorded but not used as
  a filter (v1/v2's +8%/+15% surge filter was tried and dropped — see below).
- ≥2 buy trades and ≥2 distinct buying wallets in the last 30 slots.
- Net buy SOL ≥0.05 over the last 30 slots.
- Real SOL reserves ≥1 SOL (so the 1%-of-real-reserve buy cap allows a
  ≥0.01 SOL buy, the guardrail's minimum round trip).
- At most 1 entry per mint over the run; 240-slot cooldown after an exit.
- Size: min(0.25 SOL, 1% of real SOL reserves, free cash, remaining
  exposure under the 5 SOL cap). Buys carry 1500 bps of slippage budget for
  the two-slot latency between the decision slot and the fill slot.

## Exit rules (sell the whole position on the first trigger)

- Take-profit: close value ≥ cost × 2.0.
- Hard stop: close value < cost × 0.5.
- Trailing stop: once the close value has reached cost × 1.9, sell if it
  falls 50% below its peak close value.
- Whale dump: any single recorded sell ≥5 SOL on the held mint.
- Time box: sell after 200000 slots held, whatever the price.
- Close value = tokens sold through the curve at current reserves, curve fee
  (1.25%) deducted, one tx fee deducted. Sells go out at 10000 bps slippage.
- A curve that completes is closed by the replay itself.

## Guardrail pacing

If the bot's own filled coins or fills lag the pace set in block time
(target 25 coins / 100 fills over a 6h window), it opens a tiny 0.01 SOL
probe round trip on a liquid traded curve and sells it on the next batch.
No probes in the first 5% of the window. At most 1 probe at a time, in the
slot reserved for it (maxMain is 4 of the 5 open positions).

## Tried and dropped

- **Surge-chasing entries (v1, v2)**: buy only curves already up +8%/+15%
  from creation with accelerating inflow, tight stops, short holds. Dropped:
  v1 graded −4.741 SOL (561 coins, 23% win rate, drawdown 0.497 — nearly
  at the guardrail) and v2 −3.672 SOL (448 coins, 27% win rate). Buying
  after the surge is buying high; the stops then sell low.
- **Short time box (v3b)**: 54000-slot hold cap with a reserved probe slot.
  Dropped: −1.252 SOL versus v3's −0.354 SOL — the time box forced sales
  that the long hold would have ridden out. The probe slot itself was kept
  (v3c): it cost nothing measurable and doubled the coin coverage.
- **Scale-ins into strength** (buy more while the position is up): dropped.
  The sibling Burst Rider entry showed a second buy only adds fees and
  exposure on the same coin; one buy per coin is cleaner and cheaper.
- **Momentum on old curves** (age ≥300 slots, accelerating inflow): dropped.
  The house momentum pilot lost −9.489 SOL on the dev window and the sibling's
  burst-chasing variant finished −0.525 SOL; old-curve momentum is where the
  fees and the reversals eat the bot.
- **Mean reversion** (buy the dip after a fall): dropped. The house reversion
  pilot lost −3.995 SOL on the dev window; dips on pump.fun usually keep
  dipping.
- **Probing from the first batch**: dropped. A probe in the first minutes pays
  fees on a coin the main entries would have taken anyway; probes now wait
  until 5% of the window has elapsed.

## Local sweep (grade-local, dev window, --driver process)

| version | shape | net PnL | coins | drawdown |
| --- | --- | --- | --- | --- |
| v1 | surge +8%, wide exits, 2400-slot hold | −4.741 SOL | 561 | 0.497 |
| v2 | surge +15%, tight stops, 1200-slot hold | −3.672 SOL | 448 | 0.375 |
| v3 | buy-young-hold-long, 5 mains | −0.354 SOL | 27 | 0.044 |
| v3b | v3 + probe slot + 54000-slot hold | −1.252 SOL | 76 | 0.129 |
| v3c (shipped) | v3 + probe slot, 200000-slot hold | −0.374 SOL | 42 | 0.042 |

## Expected outcomes

- Dev window (24h, 2–3 Nov 2026, 1,222 coins): v3c grades −0.374 SOL
  (return −3.7%, 90% interval −0.699..−0.127 SOL, 112 fills over 42 coins,
  58 round trips, max drawdown 0.042, guardrails met; fees 0.027 SOL curve
  + 0.012 SOL tx). Result sha256
  `23395aa5469f26e8099dd2116ba5cdd44bb82ea01112fba4db2d9d9603d18c66`
  (process driver; the server's sha differs — it runs Node v26.13.1 and the
  docker sandbox). The dev window is 24h and the final window is a different
  6h slice, so the dev score is a sanity check on mechanics (guardrails met,
  no crashes, deterministic replies), not a forecast.
- House pilots on the same dev window for reference: momentum −9.489 SOL,
  reversion −3.995 SOL, sniper −0.475 SOL, equal-weight −0.019 SOL,
  hold-cash 0.000 SOL. Tide Anchor v3c sits between sniper and equal-weight.
- The realistic goal on the final 6h window is a small positive net PnL from
  a handful of first-wave runners, with the guardrails met and drawdown well
  under 50%. A flat-to-slightly-negative score is the likely outcome if no
  runner appears; the design accepts that rather than churning for fees.
