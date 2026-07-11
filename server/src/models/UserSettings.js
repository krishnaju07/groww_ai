import mongoose from 'mongoose';
import { BROKERS, TRADING_MODES, AI_PROVIDERS, MARKET_DATA_PROVIDERS, STOCK_UNIVERSE } from '../config/constants.js';
import { env } from '../config/env.js';

const UserSettingsSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },

    tradingMode: { type: String, enum: TRADING_MODES, default: 'paper' },
    activeBroker: { type: String, enum: BROKERS, default: 'paper' },
    aiProvider: { type: String, enum: AI_PROVIDERS, default: 'openai' },
    // Per-user override of which model id the selected provider calls (see
    // config/constants.js's AI_MODEL_OPTIONS for the curated cheap/balanced/flagship
    // choices shown in Settings). Empty string = fall back to that provider's
    // env-configured default (env.AI_MODEL/OPENAI_MODEL/etc) — existing behavior
    // unchanged unless the user actually picks something. Not validated against
    // AI_MODEL_OPTIONS since a provider may add a model before this list is updated.
    aiModel: { type: String, default: '' },

    minInvestment: { type: Number, default: 1000 },
    maxInvestment: { type: Number, default: 20000 },

    // The user's personal FOCUS list — what the AI background scan, auto-trading
    // cron, and default Trade-page selectors actually iterate. Distinct from the full
    // browsable universe (all NSE equities via instrumentService.searchEquities, all
    // OPTION_UNDERLYINGS) — a user can browse/search anything but only trades-on-autopilot
    // what they've explicitly added here. Defaults preserve pre-watchlist behavior for
    // an existing install (the original curated 12 stocks + NIFTY).
    watchlist: {
      equities: { type: [String], default: () => STOCK_UNIVERSE.map((s) => s.symbol) },
      optionUnderlyings: { type: [String], default: () => ['NIFTY'] },
    },

    autoInvest: {
      enabled: { type: Boolean, default: false },
      amountPerTrade: { type: Number, default: 5000 },
      maxOpenPositions: { type: Number, default: 3 },
      // When true, a quant BUY/SELL signal must also be confirmed by the configured
      // LLM (aiProvider) before the auto-trading cron will place it — see autoTradingService.js.
      requireAiConfirmation: { type: Boolean, default: true },
      // Ensemble/quant confidence (0-100) required before the auto-trading cron will
      // even attempt a trade — see autoTradingService.js. Higher = fewer, safer trades.
      minConfidence: { type: Number, default: 75 },
    },
    autoExit: {
      enabled: { type: Boolean, default: true },
      stopLossPercent: { type: Number, default: 2 },
      targetPercent: { type: Number, default: 4 },
      trailingEnabled: { type: Boolean, default: false },
      trailingPercent: { type: Number, default: 1.5 },
      // Richer, "disciplined trader" exits (positionGuardianJob):
      // Move the stop to breakeven once a position is up this % — a winner can't turn
      // into a loser after this. 0 disables.
      moveSlToCostAtPercent: { type: Number, default: 1.5 },
      // Book part of the position at a first target, let the rest run. 0 disables.
      partialBookAtPercent: { type: Number, default: 0 },
      partialBookFraction: { type: Number, default: 0.5 }, // fraction of quantity to book (0-1)
      // Time-based exit — close a position that's gone nowhere after this many minutes
      // (only if it's not meaningfully in profit). 0 disables.
      maxHoldMinutes: { type: Number, default: 0 },
    },

    // Operational switches that used to be .env-only (server restart required to
    // change) — now editable live from Settings. Defaults mirror the current .env
    // values so migrating an existing install changes nothing until the user
    // actually touches a toggle. Read via services/config/systemConfig.js — never
    // read env.ENABLE_LIVE_TRADING/etc directly outside that one boot-time default.
    systemConfig: {
      enableLiveTrading: { type: Boolean, default: env.ENABLE_LIVE_TRADING },
      enableLiveAutoTrading: { type: Boolean, default: env.ENABLE_LIVE_AUTO_TRADING },
      liveMaxOrderValue: { type: Number, default: env.LIVE_MAX_ORDER_VALUE },
      autoTradingEnabled: { type: Boolean, default: env.AUTO_TRADING_ENABLED },
      ignoreMarketHours: { type: Boolean, default: env.IGNORE_MARKET_HOURS },
      marketDataProvider: { type: String, enum: MARKET_DATA_PROVIDERS, default: env.MARKET_DATA_PROVIDER },
      aiScanIntervalMinutes: { type: Number, default: env.AI_SCAN_INTERVAL_MINUTES },
      // Headlines older than this are filtered out of the AI decision context (see
      // newsService.js) — keeps the AI reading today's actual news, not stale
      // evergreen articles Google News' relevance ranking might otherwise surface.
      newsMaxAgeHours: { type: Number, default: env.NEWS_MAX_AGE_HOURS },
      newsHeadlineCount: { type: Number, default: env.NEWS_HEADLINE_COUNT },
      // Auto-trading time-of-day discipline (gate the unattended loop only — see
      // marketHours.getAutoTradeWindowStatus). A deliberate manual order is never blocked.
      avoidFirstMinutes: { type: Number, default: env.AVOID_FIRST_MINUTES },
      skipLunchHour: { type: Boolean, default: env.SKIP_LUNCH_HOUR },
      stopNewTradesAfter: { type: String, default: env.STOP_NEW_TRADES_AFTER },
      avoidExpiryDay: { type: Boolean, default: env.AVOID_EXPIRY_DAY },
      // When on, fresh auto-entries require a tradeable broad-market regime (see regimeService.js).
      regimeFilterEnabled: { type: Boolean, default: env.REGIME_FILTER_ENABLED },
      // Min options Opportunity Score (0-100) to spend an LLM call / take the trade (see opportunityScore.js).
      opportunityScoreThreshold: { type: Number, default: env.OPPORTUNITY_SCORE_THRESHOLD },
      // AI Consensus Engine (consensusService.js): poll all configured LLMs and require N to agree.
      consensusEnabled: { type: Boolean, default: env.CONSENSUS_ENABLED },
      consensusMinAgree: { type: Number, default: env.CONSENSUS_MIN_AGREE },
      // Learned-edge / expected-value gate (learnedEdgeService.js): veto proven-losing setups.
      learningGateEnabled: { type: Boolean, default: env.LEARNING_GATE_ENABLED },
      learningMinSample: { type: Number, default: env.LEARNING_MIN_SAMPLE },
    },
  },
  { timestamps: true },
);

export const UserSettings =
  mongoose.models.UserSettings || mongoose.model('UserSettings', UserSettingsSchema);
