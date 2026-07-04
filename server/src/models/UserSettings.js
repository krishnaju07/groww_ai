import mongoose from 'mongoose';
import { BROKERS, TRADING_MODES, AI_PROVIDERS, MARKET_DATA_PROVIDERS } from '../config/constants.js';
import { env } from '../config/env.js';

const UserSettingsSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },

    tradingMode: { type: String, enum: TRADING_MODES, default: 'paper' },
    activeBroker: { type: String, enum: BROKERS, default: 'paper' },
    aiProvider: { type: String, enum: AI_PROVIDERS, default: 'openai' },

    minInvestment: { type: Number, default: 1000 },
    maxInvestment: { type: Number, default: 20000 },

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
    },
  },
  { timestamps: true },
);

export const UserSettings =
  mongoose.models.UserSettings || mongoose.model('UserSettings', UserSettingsSchema);
