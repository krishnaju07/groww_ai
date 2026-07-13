/**
 * Atomic BUY/SELL mutations against the Position collection — shared by
 * PaperBroker (paper fills) and orderService.recordLiveFill (live fills) so the
 * race-safety fix lives in exactly one place.
 *
 * The old code in both callers did read-then-compute-then-write with plain
 * values (not $inc), which meant two concurrent BUYs on the same symbol could
 * both read the same base quantity/investedAmount and the second write would
 * silently clobber the first's contribution — capital gets debited twice but
 * only one order's shares end up tracked. applyBuyToPosition() below uses a
 * single atomic aggregation-pipeline update (quantity/investedAmount computed
 * server-side via $add against the document's own current value) so there is
 * no read-modify-write window at all.
 */
import mongoose from 'mongoose';
import { Position } from '../models/Position.js';
import { round2 } from './format.js';

/** Pipeline-style $set updates aren't cast against the schema like classic update ops are — convert explicitly. */
function toObjectIdOrNull(id) {
  return id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null;
}

/**
 * @param {{userId:string, broker:string, symbol:string, quantity:number, investmentAmount:number,
 *   price:number, stopLoss?:number|null, target?:number|null, aiDecisionId?:string|null,
 *   segment?:string, underlying?:string|null, strike?:number|null, expiry?:Date|null,
 *   optionType?:string|null, lotSize?:number|null, strategy?:string, strategyGroupId?:string|null}} input
 * @returns {Promise<import('mongoose').Document>} the updated/created Position document
 */
export async function applyBuyToPosition({
  userId,
  broker,
  symbol,
  quantity,
  investmentAmount,
  price,
  stopLoss,
  target,
  aiDecisionId,
  segment,
  underlying,
  strike,
  expiry,
  optionType,
  lotSize,
  strategy,
  strategyGroupId,
}) {
  const pipeline = [
    {
      $set: {
        userId: { $ifNull: ['$userId', userId] },
        broker: { $ifNull: ['$broker', broker] },
        symbol: { $ifNull: ['$symbol', symbol] },
        segment: { $ifNull: ['$segment', segment ?? 'CASH'] },
        underlying: { $ifNull: ['$underlying', underlying ?? null] },
        strike: { $ifNull: ['$strike', strike ?? null] },
        expiry: { $ifNull: ['$expiry', expiry ?? null] },
        optionType: { $ifNull: ['$optionType', optionType ?? null] },
        lotSize: { $ifNull: ['$lotSize', lotSize ?? null] },
        quantity: { $add: [{ $ifNull: ['$quantity', 0] }, quantity] },
        investedAmount: { $add: [{ $ifNull: ['$investedAmount', 0] }, investmentAmount] },
        highestPriceSeen: { $max: [{ $ifNull: ['$highestPriceSeen', 0] }, price] },
        stopLoss: { $ifNull: ['$stopLoss', stopLoss ?? null] },
        target: { $ifNull: ['$target', target ?? null] },
        aiDecisionId: { $ifNull: ['$aiDecisionId', toObjectIdOrNull(aiDecisionId)] },
        strategy: { $ifNull: ['$strategy', strategy ?? 'DIRECTIONAL'] },
        strategyGroupId: { $ifNull: ['$strategyGroupId', strategyGroupId ?? null] },
        openedAt: { $ifNull: ['$openedAt', new Date()] },
      },
    },
    { $set: { avgBuyPrice: { $divide: ['$investedAmount', '$quantity'] } } },
  ];

  try {
    return await Position.findOneAndUpdate({ userId, broker, symbol }, pipeline, { upsert: true, new: true });
  } catch (err) {
    // Two concurrent first-buys on a brand-new symbol can both attempt the upsert and
    // one loses a duplicate-key race on the (userId,broker,symbol) unique index — the
    // document now exists (created by the winner), so retry as a plain (non-upsert)
    // update, which will correctly $add onto what the winner just inserted.
    if (err.code === 11000) {
      return await Position.findOneAndUpdate({ userId, broker, symbol }, pipeline, { new: true });
    }
    throw err;
  }
}

/**
 * @param {{userId:string, broker:string, symbol:string, quantity:number}} input
 * @returns {Promise<{costBasis:number, avgBuyPrice:number}>}
 * @throws {Error & {code:'NO_POSITION', status:400}} if there isn't enough quantity to sell
 */
export async function applySellToPosition({ userId, broker, symbol, quantity }) {
  const position = await Position.findOne({ userId, broker, symbol });
  if (!position || position.quantity < quantity) {
    throw noPositionError(broker, symbol);
  }
  // avgBuyPrice only changes on a BUY, never on a SELL, so reading it here (rather than
  // inside the atomic update below) is safe — the only real race to guard against is
  // "enough quantity to sell", which the conditional filter below closes atomically.
  const costBasis = round2(position.avgBuyPrice * quantity);

  const updated = await Position.findOneAndUpdate(
    { _id: position._id, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity, investedAmount: -costBasis } },
    { new: true },
  );
  if (!updated) {
    // Lost a race against a concurrent sell that ran between the read above and this
    // update — fail closed rather than let quantity go negative.
    throw noPositionError(broker, symbol);
  }
  if (updated.quantity <= 0) {
    await Position.deleteOne({ _id: updated._id });
  }
  return { costBasis, avgBuyPrice: position.avgBuyPrice };
}

function noPositionError(broker, symbol) {
  const e = new Error(`No sufficient ${broker} position in ${symbol} to sell.`);
  e.code = 'NO_POSITION';
  e.status = 400;
  return e;
}
