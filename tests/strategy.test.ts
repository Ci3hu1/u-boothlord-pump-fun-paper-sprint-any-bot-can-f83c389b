// Exit-rule tests for the Tide Anchor strategy: after the bot buys a young
// surging curve, a later batch with the filled position and fresh marks must
// sell the whole position on take-profit, on the hard stop, and on the time box.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BotState, type Batch, type Hello } from '../vendor/makefun-bot.ts';
import { createStrategy, DEFAULT_PARAMS } from '../strategy.ts';

const MINT_A = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const CREATOR = '7xKXtt2Khs6ShQha5xT8FvM9vJ3hP4qL2mN8wR5tY7uI';
const VT = 1_073_000_000_000_000n;
const VQ0 = 30_000_000_000n;
const TOKENS = 1_800_000_000_000n; // tokens a 0.05 SOL buy receives near the create price

function hello(): Hello {
  return {
    type: 'hello',
    protocol: 'agent-fun/replay/v2',
    seed: '999',
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
    event: 'CreateEvent', mint, slot, block_time: time, chain_seq: 0,
    signature: 'sig-create', name: 'Test', symbol: 'TEST',
    uri: 'https://example.invalid/t.json', bonding_curve: CREATOR,
    user: CREATOR, creator: CREATOR, timestamp: String(time),
    virtual_token_reserves: VT.toString(), virtual_sol_reserves: VQ0.toString(),
    real_token_reserves: VT.toString(), token_total_supply: VT.toString(),
    token_program: CREATOR, is_mayhem_mode: false, is_cashback_enabled: false,
    quote_mint: 'So11111111111111111111111111111111111111112',
    virtual_quote_reserves: VQ0.toString(), creator_fee_bps: 0,
    is_holder_reward: false, depth: 0,
  };
}

function tradeEvent(mint: string, slot: number, time: number, vq: bigint): any {
  return {
    event: 'TradeEvent', mint, slot, block_time: time, chain_seq: 0,
    signature: `sig-${slot}`, sol_amount: '100000000', token_amount: '1000000000',
    is_buy: true, user: 'U1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', timestamp: String(time),
    virtual_sol_reserves: vq.toString(), virtual_token_reserves: VT.toString(),
    real_sol_reserves: '5000000000', real_token_reserves: VT.toString(),
    fee_recipient: CREATOR, fee_basis_points: '0', fee: '0', creator: CREATOR,
    creator_fee_basis_points: '0', creator_fee: '0', track_volume: true,
    total_unclaimed_tokens: '0', total_claimed_tokens: '0', current_sol_volume: '0',
    last_update_timestamp: String(time), ix_name: 'trade', mayhem_mode: false,
    cashback_fee_basis_points: '0', cashback: '0', buyback_fee_basis_points: '0',
    buyback: '0', shareholders: [],
    quote_mint: 'So11111111111111111111111111111111111111112',
    quote_amount: '100000000', virtual_quote_reserves: vq.toString(),
    real_quote_reserves: '5000000000', holder_rewards_bps: '0',
    holder_rewards: '0', creator_fee_unclaimed: '0',
  };
}

function mark(mint: string, slot: number, vq: bigint): any {
  return {
    mint, slot,
    virtual_token_reserves: VT.toString(),
    virtual_quote_reserves: vq.toString(),
    real_token_reserves: VT.toString(),
    real_quote_reserves: '5000000000',
  };
}

/** Run the bot through the buy, then one batch with the filled position. */
function runToExit(markVq: bigint, exitSlot: number): any[] {
  const state = new BotState(hello());
  const bot = createStrategy(DEFAULT_PARAMS);
  const users = ['U1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'U2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'U3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
  const events: any[] = [createEvent(MINT_A, 100, 1_700_000_000)];
  let vq = VQ0;
  for (let i = 0; i < 6; i++) {
    vq = (vq * 102n) / 100n;
    events.push(tradeEvent(MINT_A, 105 + i * 5, 1_700_000_000 + i * 2, vq));
    events[events.length - 1].user = users[i % 3];
  }
  const b0 = { type: 'batch', seq: 0, slot: 100, events: [events[0]], marks: [], fills: [], account: { cash_lamports: '10000000000', positions: [] } } as unknown as Batch;
  state.applyBatch(b0);
  bot.onBatch(state, b0);
  const b1 = { type: 'batch', seq: 1, slot: 135, events: events.slice(1), marks: [], fills: [], account: { cash_lamports: '10000000000', positions: [] } } as unknown as Batch;
  state.applyBatch(b1);
  const orders = bot.onBatch(state, b1) ?? [];
  const wire = state.toOrders(orders);
  assert.equal(wire.length, 1, 'expected the entry buy');
  assert.equal(wire[0].side, 'buy');
  state.recordOrders(wire);
  const fill = {
    client_id: wire[0].client_id, mint: MINT_A, side: 'buy', status: 'filled',
    reason: null, decided_slot: 135, slot: 137, quote_lamports: '50000000',
    token_amount: TOKENS.toString(), fee_lamports: '625000', tx_fee_lamports: '105000',
    fee_fallback: false,
  };
  const b2 = {
    type: 'batch', seq: 2, slot: exitSlot,
    events: [tradeEvent(MINT_A, exitSlot, 1_700_000_100, markVq)],
    marks: [mark(MINT_A, exitSlot, markVq)],
    fills: [fill],
    account: {
      cash_lamports: '9950000000',
      positions: [{ mint: MINT_A, token_amount: TOKENS.toString(), cost_lamports: '51000000' }],
    },
  } as unknown as Batch;
  state.applyBatch(b2);
  return bot.onBatch(state, b2) ?? [];
}

test('exit: take-profit sells the whole position once value doubles cost', () => {
  // Marks at 65 SOL virtual quote: value ~0.107 SOL vs cost 0.051 SOL (+110%).
  const orders = runToExit(65_000_000_000n, 200);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].side, 'sell');
  assert.equal(orders[0].mint, MINT_A);
  assert.equal(String((orders[0] as any).token_amount), TOKENS.toString());
});

test('exit: hard stop sells the whole position once value halves cost', () => {
  // Marks at 12 SOL virtual quote: value ~0.0197 SOL vs cost 0.051 SOL (-61%).
  const orders = runToExit(12_000_000_000n, 200);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].side, 'sell');
});

test('exit: time box sells at maxHold even when the price is flat', () => {
  // Marks at the create price: value ~0.05 SOL, no profit or loss trigger;
  // slot 135 + 200000 + 1 is past the hold limit, so the time box fires.
  const orders = runToExit(VQ0, 135 + DEFAULT_PARAMS.maxHold + 1);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].side, 'sell');
});

test('exit: no sell while the position sits inside its bands', () => {
  // Marks at 33 SOL virtual quote: value ~0.055 SOL vs cost 0.051 (+8%).
  const orders = runToExit(33_000_000_000n, 200);
  assert.equal(orders.length, 0);
});
