// Determinism + protocol tests for the Tide Anchor strategy.
//
// Run: node --test tests/   (Node 22.18+ strips the types; no build step)
// The determinism test drives the strategy twice over the same synthetic
// hello / batch stream and requires the two reply streams to match byte for
// byte — the same property the grader checks when it executes the entry twice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BotState, type Batch, type Hello } from '../vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from '../strategy.ts';

const MINT_A = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const MINT_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const CREATOR = '7xKXtt2Khs6ShQha5xT8FvM9vJ3hP4qL2mN8wR5tY7uI';
const VT = 1_073_000_000_000_000n; // virtual token reserves, like a fresh curve
const VQ0 = 30_000_000_000n; // virtual SOL reserves at creation (30 SOL)

function hello(): Hello {
  return {
    type: 'hello',
    protocol: 'agent-fun/replay/v2',
    seed: '12345',
    universe: {
      program: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
      quote: 'SOL',
      mayhem: 'excluded',
      exclude_cashback: true,
      sample: { hash: 'sha256', modulus: 16, residue: 15 },
    },
    capital: { lamports: '10000000000' },
    caps: {
      max_open_positions: 5,
      max_order_bps_of_real_reserve: 100,
      max_orders_per_batch: 16,
      shorts: false,
      leverage: false,
    },
    latency_slots: 2,
    fees: {
      protocol_bps_fallback: 95,
      creator_bps_fallback: 30,
      base_fee_lamports: '5000',
      priority_fee_lamports: '100000',
      failed_tx_bps: 200,
    },
  };
}

function createEvent(mint: string, slot: number, time: number): any {
  return {
    event: 'CreateEvent',
    mint,
    slot,
    block_time: time,
    chain_seq: 0,
    signature: 'sig-create',
    name: 'Test',
    symbol: 'TEST',
    uri: 'https://example.invalid/t.json',
    bonding_curve: CREATOR,
    user: CREATOR,
    creator: CREATOR,
    timestamp: String(time),
    virtual_token_reserves: VT.toString(),
    virtual_sol_reserves: VQ0.toString(),
    real_token_reserves: VT.toString(),
    token_total_supply: VT.toString(),
    token_program: CREATOR,
    is_mayhem_mode: false,
    is_cashback_enabled: false,
    quote_mint: 'So11111111111111111111111111111111111111112',
    virtual_quote_reserves: VQ0.toString(),
    creator_fee_bps: 0,
    is_holder_reward: false,
    depth: 0,
  };
}

function tradeEvent(
  mint: string,
  slot: number,
  time: number,
  isBuy: boolean,
  solLamports: bigint,
  user: string,
  vq: bigint,
  realSol: bigint,
): any {
  return {
    event: 'TradeEvent',
    mint,
    slot,
    block_time: time,
    chain_seq: 0,
    signature: `sig-${slot}`,
    sol_amount: solLamports.toString(),
    token_amount: '1000000000',
    is_buy: isBuy,
    user,
    timestamp: String(time),
    virtual_sol_reserves: vq.toString(),
    virtual_token_reserves: VT.toString(),
    real_sol_reserves: realSol.toString(),
    real_token_reserves: VT.toString(),
    fee_recipient: CREATOR,
    fee_basis_points: '0',
    fee: '0',
    creator: CREATOR,
    creator_fee_basis_points: '0',
    creator_fee: '0',
    track_volume: true,
    total_unclaimed_tokens: '0',
    total_claimed_tokens: '0',
    current_sol_volume: '0',
    last_update_timestamp: String(time),
    ix_name: 'trade',
    mayhem_mode: false,
    cashback_fee_basis_points: '0',
    cashback: '0',
    buyback_fee_basis_points: '0',
    buyback: '0',
    shareholders: [],
    quote_mint: 'So11111111111111111111111111111111111111112',
    quote_amount: solLamports.toString(),
    virtual_quote_reserves: vq.toString(),
    real_quote_reserves: realSol.toString(),
    holder_rewards_bps: '0',
    holder_rewards: '0',
    creator_fee_unclaimed: '0',
  };
}

function batch(seq: number, slot: number, events: any[], opts: any = {}): Batch {
  return {
    type: 'batch',
    seq,
    slot,
    events,
    marks: opts.marks ?? [],
    fills: opts.fills ?? [],
    account: opts.account ?? { cash_lamports: '10000000000', positions: [] },
  } as unknown as Batch;
}

/** A young curve surging: create at slot 100, buys push the price +10%. */
function surgeStream(): Batch[] {
  const users = ['U1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'U2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'U3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
  const events: any[] = [createEvent(MINT_A, 100, 1_700_000_000)];
  let vq = VQ0;
  for (let i = 0; i < 6; i++) {
    vq = (vq * 102n) / 100n; // +2% a trade
    events.push(tradeEvent(MINT_A, 105 + i * 5, 1_700_000_000 + i * 2, true, 100_000_000n, users[i % 3]!, vq, 5_000_000_000n));
  }
  return [batch(0, 100, [events[0]]), batch(1, 135, events.slice(1))];
}

/** Drive a strategy over batches, returning the JSON replies per batch. */
function drive(batches: Batch[]): string[] {
  const state = new BotState(hello());
  const bot = createStrategy(DEFAULT_PARAMS);
  const out: string[] = [];
  for (const b of batches) {
    state.applyBatch(b);
    const orders = bot.onBatch(state, b) ?? [];
    const wire = state.toOrders(orders);
    out.push(JSON.stringify(wire));
    state.recordOrders(wire);
  }
  return out;
}

test('determinism: two runs over the same stream reply byte for byte', () => {
  const stream = surgeStream();
  const a = drive(stream);
  const b = drive(stream);
  assert.deepEqual(a, b);
  assert.equal(a.length, 2);
});

test('entry: a young surging curve gets a buy, capped at 1% of real reserves', () => {
  const replies = drive(surgeStream()).map((r) => JSON.parse(r));
  const buys = replies.flat().filter((o: any) => o.side === 'buy');
  assert.equal(buys.length, 1);
  assert.equal(buys[0].mint, MINT_A);
  // Real reserves 5 SOL -> cap 0.05 SOL, below the 0.4 SOL stake.
  assert.equal(buys[0].quote_lamports, '50000000');
});

test('entry: no buy when the curve is older than the entry window', () => {
  const users = ['U1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'U2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'U3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
  const events: any[] = [createEvent(MINT_B, 100, 1_700_000_000)];
  let vq = VQ0;
  for (let i = 0; i < 6; i++) {
    vq = (vq * 101n) / 100n;
    events.push(tradeEvent(MINT_B, 400 + i * 5, 1_700_000_000 + i * 2, true, 100_000_000n, users[i % 3]!, vq, 5_000_000_000n));
  }
  const replies = drive([batch(0, 100, [events[0]]), batch(1, 430, events.slice(1))]).map((r) => JSON.parse(r));
  assert.equal(replies.flat().length, 0);
});

test('entry: no buy when the flow is all sells (net flow negative)', () => {
  const users = ['U1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'U2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'U3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
  const events: any[] = [createEvent(MINT_A, 100, 1_700_000_000)];
  for (let i = 0; i < 6; i++) {
    events.push(tradeEvent(MINT_A, 105 + i * 5, 1_700_000_000 + i * 2, false, 100_000_000n, users[i % 3]!, VQ0, 5_000_000_000n));
  }
  const replies = drive([batch(0, 100, [events[0]]), batch(1, 135, events.slice(1))]).map((r) => JSON.parse(r));
  assert.equal(replies.flat().length, 0);
});
