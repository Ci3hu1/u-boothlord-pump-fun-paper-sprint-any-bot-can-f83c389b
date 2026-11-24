// Tide Anchor — a deterministic paper bot for the pump.fun bonding-curve replay.
//
// Idea: on a 6-hour window the first wave is the trade. A fresh curve that
// surges within its first minutes — price up from its creation price on
// several distinct buyers and real net SOL inflow — is bought once, in size,
// and then left alone: no scale-ins, no fiddling. The position rides until a
// take-profit, a hard stop, a trailing stop from its peak, a whale dump, or a
// fixed time box ends it, and the freed slot rotates into the next fresh
// breakout. Few round trips means few fees; the 1.25% curve fee plus the
// per-order tx fee punishes every extra trade, so each coin is exactly one
// buy and one sell.
//
// This is deliberately NOT a momentum-chaser on old curves and NOT a
// mean-reversion bot: entries are young (5–150 slots after creation), stakes
// are large (up to 0.4 SOL, capped by 1% of the curve's real SOL reserve),
// holds are long (up to 2400 slots), and exits are wide. The guardrail pace
// (a round trip of at least 0.01 SOL on at least 20 coins) is met by rotation
// through the 5 open slots, with tiny probe round trips only as a fallback
// when the bot's own fills or coins lag the pace set in block time.
//
// Deterministic by construction: no clock, no environment, no Math.random;
// every iteration is over insertion-ordered maps fed by the batch stream, and
// every number is a plain IEEE-754 double computed the same way on every run.
// The only seed the bot could use is hello.seed, and it needs none.
//
// Wire notes (hello / batch / orders / slot): the shim owns the wire. Each
// batch carries the slot, the universe events in chain order, marks for held
// or pending mints, the fills that resolved since the previous batch, and the
// account after those fills. The orders this batch returns are decided on
// this slot and fill at slot + latency_slots, so every price used here is a
// decision-time price and every buy carries a slippage budget for the
// two-slot move.

import type { Batch, Bot, BotState, OrderInput, Pubkey } from './vendor/makefun-bot.ts';

export interface AnchorParams {
  /** Entry age window in slots after the CreateEvent. */
  minAge: number;
  maxAge: number;
  /** Price now over creation price, minus 1. */
  minPriceUp: number;
  /** Buy trades in the entry window. */
  minBuys: number;
  /** Distinct buying wallets in the entry window. */
  minBuyers: number;
  /** Net buy SOL (buys minus sells) over the entry window. */
  minNetSol: number;
  /** Entry window in slots. */
  window: number;
  /** Curve real SOL bounds at entry. */
  minRealSol: number;
  /** SOL to put into one position (capped by 1% of real reserves). */
  stakeSol: number;
  /** Smallest buy worth sending. */
  minBuySol: number;
  /** Slippage on buys (bps); sells always go out at 10000. */
  buySlipBps: number;
  /** Exits. */
  takeProfit: number;
  stopLoss: number;
  trail: number;
  /** The trailing stop arms once value reached cost * (1 + trailArm). */
  trailArm: number;
  /** Exit on any single recorded sell of at least this many SOL. */
  bigSellSol: number;
  /** Exit after this many slots held, whatever the price. */
  maxHold: number;
  /** Slots to wait after an exit before the same curve may be bought again. */
  cooldown: number;
  /** Most entries per curve over the run. */
  maxEntries: number;
  /** Most anchor positions open at once. */
  maxMain: number;
  /** Guardrail pacing targets. */
  targetCoins: number;
  targetFills: number;
  paceSecs: number;
  probeSol: number;
  maxProbes: number;
  /** Most SOL at cost across all positions at once (a drawdown guard). */
  maxExposureSol: number;
}

// v3c settings. v3b graded −1.252 SOL (76 coins, drawdown 0.129): the
// reserved probe slot fixed the coin coverage, but the score fell ~0.9 SOL
// versus v3. v3c keeps the reserved probe slot (maxMain 4) and restores the
// long hold (200000 slots) to test whether the v3b loss came from the
// 54000-slot time box or from the probe slot itself.
export const DEFAULT_PARAMS: AnchorParams = {
  minAge: 5,
  maxAge: 300,
  minPriceUp: 0,
  minBuys: 2,
  minBuyers: 2,
  minNetSol: 0.05,
  window: 30,
  minRealSol: 1,
  stakeSol: 0.25,
  minBuySol: 0.01,
  buySlipBps: 1500,
  takeProfit: 1.0,
  stopLoss: 0.5,
  trail: 0.5,
  trailArm: 0.9,
  bigSellSol: 5,
  maxHold: 200_000,
  cooldown: 240,
  maxEntries: 1,
  maxMain: 4,
  targetCoins: 25,
  targetFills: 100,
  paceSecs: 21_600,
  probeSol: 0.01,
  maxProbes: 1,
  maxExposureSol: 5,
};

const LAMPORTS = 1e9;
const CURVE_FEE = 0.0125;
const BPS_PER_UNIT = 10_000;

interface Trade {
  slot: number;
  buy: boolean;
  sol: number;
  user: string;
  price: number;
}

interface Tape {
  created: number | null;
  createPrice: number;
  trades: Trade[];
  entries: number;
  lastExit: number;
}

interface Held {
  opened: number;
  peakValue: number;
  /** SOL sent in buys for this position (fees included). */
  invested: number;
  exiting: boolean;
  /** Some buy of this position filled. */
  filled: boolean;
  /** Close value at the latest batch (SOL, curve and tx fees deducted). */
  lastValue: number;
}

export function createStrategy(p: AnchorParams = DEFAULT_PARAMS): Bot {
  const tapes = new Map<Pubkey, Tape>();
  const held = new Map<Pubkey, Held>();
  /** Probe round trips in flight, by mint: false while buying, true once selling. */
  const probes = new Map<Pubkey, boolean>();
  /** The bot's own filled orders and the coins they were on (harness closes excluded). */
  let myFills = 0;
  const myCoins = new Set<Pubkey>();
  let firstTime: number | null = null;
  let lastTime: number | null = null;
  const keep = Math.max(p.window, p.maxHold) + 5;

  const tapeOf = (mint: Pubkey): Tape => {
    let t = tapes.get(mint);
    if (t === undefined) {
      t = { created: null, createPrice: 0, trades: [], entries: 0, lastExit: -1e12 };
      tapes.set(mint, t);
    }
    return t;
  };

  /** Entry signal on a curve's tape at slot `now`. */
  const entrySignal = (t: Tape, now: number, rqSol: number): boolean => {
    if (rqSol < p.minRealSol) return false;
    if (t.created === null || now - t.created < p.minAge || now - t.created > p.maxAge) return false;
    if (t.createPrice <= 0) return false;
    const from = now - p.window;
    let buySol = 0;
    let sellSol = 0;
    let buys = 0;
    let last = 0;
    const byUser = new Map<string, number>();
    for (const tr of t.trades) {
      if (tr.slot <= from) continue;
      if (tr.buy) {
        buySol += tr.sol;
        buys++;
        byUser.set(tr.user, (byUser.get(tr.user) ?? 0) + tr.sol);
      } else {
        sellSol += tr.sol;
      }
      last = tr.price;
    }
    if (buys < p.minBuys || byUser.size < p.minBuyers) return false;
    if (buySol - sellSol < p.minNetSol) return false;
    if (last <= 0) return false;
    if (last / t.createPrice - 1 < p.minPriceUp) return false;
    return true;
  };

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const now = batch.slot;
      const bigSell = new Set<Pubkey>();
      const traded = new Set<Pubkey>();
      for (const f of batch.fills) {
        if (f.status === 'filled' && !f.client_id.startsWith('_')) {
          myFills++;
          myCoins.add(f.mint);
        }
      }
      for (const e of batch.events) {
        if (e.block_time !== null) {
          if (firstTime === null) firstTime = e.block_time;
          if (lastTime === null || e.block_time > lastTime) lastTime = e.block_time;
        }
        if (e.event === 'CreateEvent') {
          const t = tapeOf(e.mint);
          t.created = e.slot;
          t.createPrice = Number(e.virtual_quote_reserves) / Number(e.virtual_token_reserves);
        } else if (e.event === 'TradeEvent') {
          const t = tapeOf(e.mint);
          const sol = Number(e.sol_amount) / LAMPORTS;
          const price = Number(e.virtual_quote_reserves) / Number(e.virtual_token_reserves);
          if (t.created === null) {
            // First seen through a trade: treat this as its birth.
            t.created = e.slot;
            t.createPrice = price;
          }
          t.trades.push({ slot: e.slot, buy: e.is_buy, sol, user: e.user, price });
          traded.add(e.mint);
          if (!e.is_buy && sol >= p.bigSellSol) bigSell.add(e.mint);
        }
      }
      for (const mint of traded) {
        const t = tapes.get(mint)!;
        let cut = 0;
        while (cut < t.trades.length && t.trades[cut]!.slot <= now - keep) cut++;
        if (cut > 0) t.trades.splice(0, cut);
      }
      const marks = new Map(batch.marks.map((m) => [m.mint, m] as const));
      const pendingByMint = new Map<Pubkey, number>();
      for (const po of state.pending.values()) {
        pendingByMint.set(po.order.mint, (pendingByMint.get(po.order.mint) ?? 0) + 1);
      }

      const orders: OrderInput[] = [];
      const cap = state.hello.caps.max_orders_per_batch;
      const tx = Number(state.txFeeLamports()) / LAMPORTS;

      // Exits first: a position is sold whole on the first of a take-profit,
      // a hard stop, a trailing stop from its best close value, a whale dump,
      // or the time box. A curve that completes is closed by the replay itself.
      for (const [mint, h] of held) {
        const pos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (pos === undefined) {
          if (!pendingByMint.has(mint)) {
            held.delete(mint);
            const t = tapeOf(mint);
            if (h.filled) t.lastExit = now;
            else t.entries--;
          }
          continue;
        }
        h.filled = true;
        if (curve === undefined || curve.complete) continue;
        const mk = marks.get(mint);
        const vq = mk ? Number(mk.virtual_quote_reserves) : Number(curve.virtual_quote_reserves);
        const vt = mk ? Number(mk.virtual_token_reserves) : Number(curve.virtual_token_reserves);
        const tokens = Number(pos.token_amount);
        const value = ((tokens * vq) / (vt + tokens) / LAMPORTS) * (1 - CURVE_FEE) - tx;
        const cost = Number(pos.cost_lamports) / LAMPORTS;
        if (value > h.peakValue) h.peakValue = value;
        h.lastValue = value;
        let exit = h.exiting;
        if (!exit && p.takeProfit > 0 && value >= cost * (1 + p.takeProfit)) exit = true;
        if (!exit && value < cost * (1 - p.stopLoss)) exit = true;
        if (!exit && h.peakValue >= cost * (1 + p.trailArm) && value < h.peakValue * (1 - p.trail)) exit = true;
        if (!exit && bigSell.has(mint)) exit = true;
        if (!exit && now - h.opened > p.maxHold) exit = true;
        if (!exit) continue;
        h.exiting = true;
        if (pendingByMint.has(mint)) {
          let sellPending = false;
          for (const po of state.pending.values()) {
            if (po.order.mint === mint && po.order.side === 'sell') sellPending = true;
          }
          if (sellPending) continue;
        }
        if (orders.length >= cap) break;
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
      }

      // Probe round trips: sell the whole probe as soon as its buy has landed.
      for (const [mint, selling] of probes) {
        const pos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (pos === undefined) {
          if (!pendingByMint.has(mint)) probes.delete(mint);
          continue;
        }
        if (curve === undefined || curve.complete || pendingByMint.has(mint)) continue;
        if (orders.length >= cap) break;
        orders.push({ side: 'sell', mint, token_amount: pos.token_amount, max_slippage_bps: 10_000 });
        if (!selling) probes.set(mint, true);
      }

      // Then entries, in the order the batch's events carried them. One buy
      // per coin, sized to the smaller of the stake and the 1%-of-real-reserve
      // cap, and never past the exposure guard.
      let free = Number(state.freeCashLamports()) / LAMPORTS;
      let slotsLeft = state.hello.caps.max_open_positions - state.committedPositionCount();
      let mainLeft = p.maxMain - held.size;
      let exposure = 0;
      for (const [mint, h] of held) {
        exposure += Math.max(h.invested, Number(state.positions.get(mint)?.cost_lamports ?? 0n) / LAMPORTS);
      }
      for (const mint of traded) {
        if (orders.length >= cap) break;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        if (held.has(mint) || pendingByMint.has(mint) || probes.has(mint)) continue;
        if (slotsLeft <= 0 || mainLeft <= 0) continue;
        const t = tapes.get(mint)!;
        if (t.entries >= p.maxEntries || now - t.lastExit < p.cooldown) continue;
        if (!entrySignal(t, now, Number(curve.real_quote_reserves) / LAMPORTS)) continue;
        const capSol = Math.floor(Number(state.maxBuyLamports(mint))) / LAMPORTS;
        let amount = Math.min(capSol, p.stakeSol, p.maxExposureSol - exposure);
        if (amount > free - tx) amount = free - tx;
        if (amount < p.minBuySol) continue;
        const lamports = BigInt(Math.floor(amount * LAMPORTS));
        orders.push({ side: 'buy', mint, quote_lamports: lamports, max_slippage_bps: p.buySlipBps });
        free -= amount + tx;
        exposure += amount;
        held.set(mint, {
          opened: now,
          peakValue: 0,
          invested: amount,
          exiting: false,
          filled: false,
          lastValue: 0,
        });
        t.entries++;
        slotsLeft--;
        mainLeft--;
      }

      // Guardrail pacing: open a probe when the bot's fills or coins lag the pace.
      if (probes.size < p.maxProbes && slotsLeft > 0 && firstTime !== null && lastTime !== null) {
        const pace = Math.min(1, (lastTime - firstTime) / p.paceSecs);
        // No probes in the first 5% of the window: the bot has the whole run
        // to accumulate coins, and an early probe just pays fees on a coin
        // the main entries would have taken anyway.
        if (pace < 0.05) return orders;
        const needCoins = myCoins.size < Math.ceil(p.targetCoins * pace);
        const needFills = myFills < Math.ceil(p.targetFills * pace);
        if (needCoins || needFills) {
          const minRq = (p.probeSol * BPS_PER_UNIT) / state.hello.caps.max_order_bps_of_real_reserve;
          for (const mint of traded) {
            if (orders.length >= cap || probes.size >= p.maxProbes) break;
            if (held.has(mint) || probes.has(mint) || pendingByMint.has(mint) || state.positions.has(mint)) continue;
            if (needCoins && !needFills && myCoins.has(mint)) continue;
            const curve = state.curves.get(mint);
            if (curve === undefined || curve.complete) continue;
            if (Number(curve.real_quote_reserves) / LAMPORTS < minRq * 1.5) continue;
            if (free < p.probeSol + 2 * tx) break;
            orders.push({ side: 'buy', mint, quote_lamports: BigInt(Math.floor(p.probeSol * LAMPORTS)), max_slippage_bps: p.buySlipBps });
            probes.set(mint, false);
            free -= p.probeSol + tx;
          }
        }
      }
      return orders;
    },
  };
}
