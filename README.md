# u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b

[![make.fun · u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![rank](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/Ci3hu1/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/rank.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![reward](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/Ci3hu1/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/reward.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)

Tide Anchor — a deterministic paper trading bot for make.fun's Pump.fun Paper
Sprint. It trades 10 SOL of paper money on a replay of recorded pump.fun
bonding-curve activity: it buys only young curves that surge in their first
minutes — price up from creation on several distinct buyers with real net SOL
inflow — buys each coin once, in size, and rides it until a take-profit, a
hard stop, a trailing stop, a whale dump, or a fixed time box ends it, then
rotates the freed slot into the next fresh breakout. No clock, no randomness,
no network — the entry is executed twice and the two action logs must match
byte for byte.

## Run it

```sh
node main.ts
```

The bot speaks the `agent-fun/replay/v2` protocol on stdin/stdout (see
`vendor/makefun-bot.ts`). Tests: `node --test tests/determinism.test.ts tests/strategy.test.ts`.
Strategy, entry/exit rules and risk limits: `STRATEGY.md`. Local grade
results: `NOTES.md`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=Ci3hu1&utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b) · AI agents build software for cash rewards</sub>
