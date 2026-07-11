/**
 * Shared JSDoc shapes. Mirrored (subset, presentation-relevant fields) in
 * client/src/types.js — keep both in sync when a shape changes.
 */

/** @typedef {'paper'|'groww'} BrokerName */
/** @typedef {'paper'|'live'} TradingMode */
/** @typedef {'BUY'|'SELL'} Action */
/** @typedef {'BUY'|'SELL'|'WAIT'} AiAction */
/** @typedef {'PENDING'|'PLACED'|'FILLED'|'PARTIALLY_FILLED'|'CANCELLED'|'REJECTED'} OrderStatus */
/** @typedef {'manual'|'automatic'|'ai'} TradeSource */

/**
 * @typedef {Object} PlaceOrderInput
 * @property {string} symbol
 * @property {Action} action
 * @property {number} quantity
 * @property {'MARKET'|'LIMIT'} [orderType]
 * @property {number} [price]            required for LIMIT
 * @property {number} [triggerPrice]
 * @property {'CNC'|'MIS'} [product]
 */

/**
 * @typedef {Object} OrderResult
 * @property {string} brokerOrderId
 * @property {OrderStatus} status
 * @property {number} [filledPrice]
 * @property {number} [filledQuantity]
 * @property {string} [rejectReason]
 */

/**
 * @typedef {Object} Holding
 * @property {string} symbol
 * @property {number} quantity
 * @property {number} avgPrice
 * @property {number} ltp
 */

/**
 * @typedef {Object} BrokerAdapter
 * @property {BrokerName} name
 * @property {() => Promise<boolean>} isConnected
 * @property {() => Promise<void>} connect
 * @property {(o: PlaceOrderInput) => Promise<OrderResult>} placeOrder
 * @property {(orderId: string, patch: Partial<PlaceOrderInput>) => Promise<OrderResult>} modifyOrder
 * @property {(orderId: string) => Promise<OrderResult>} cancelOrder
 * @property {(orderId: string) => Promise<OrderResult>} getOrderStatus
 * @property {() => Promise<OrderResult[]>} getOrderList
 * @property {(symbol: string) => Promise<number>} getLTP
 * @property {(symbols: string[]) => Promise<Record<string, number>>} getLTPBatch
 * @property {() => Promise<Holding[]>} getHoldings
 * @property {() => Promise<Holding[]>} getPositions
 * @property {() => Promise<{available: number, used: number}>} getMargin
 * @property {() => Promise<void>} cancelAllOrders
 * @property {() => Promise<void>} closeAllPositions
 */

/**
 * @typedef {Object} ScoreBreakdown
 * @property {number} trendConfluence   0-100 — agreement across the 5m/15m/30m timeframes
 * @property {number} momentum          0-100 — RSI/MACD exhaustion vs room-to-run
 * @property {number} volumeConviction  0-100 — volume support for the move
 * @property {number} newsSentiment     0-100 — today's headlines, 50 = neutral/no news
 * @property {number} trackRecord       0-100 — this symbol's own past AI-decision win rate, 50 = no history yet
 */

/**
 * @typedef {Object} AiDecision
 * @property {AiAction} action
 * @property {number} quantity
 * @property {number} stopLoss
 * @property {number} target
 * @property {string} reason          one-sentence summary (used as Order/Trade triggerReason — keep short)
 * @property {number} confidence      0-100, overall
 * @property {string} [justification] 2-4 sentence detailed reasoning covering technicals, news, and track record
 * @property {ScoreBreakdown} [scoreBreakdown]
 */

/**
 * @typedef {Object} IndicatorSnapshot
 * @property {number} ltp
 * @property {number} rsi
 * @property {{macd:number, signal:number, histogram:number}} macd
 * @property {number} volumeRatio
 * @property {'UP'|'DOWN'|'SIDEWAYS'} trendShortTerm 5m-candle trend
 * @property {'UP'|'DOWN'|'SIDEWAYS'} trendMediumTerm 15m-candle trend
 * @property {'UP'|'DOWN'|'SIDEWAYS'} trendLongTerm 30m-candle trend
 * @property {{value:number, trend:'UP'|'DOWN'|'SIDEWAYS'}} psar Parabolic SAR (5m) — price above the dot is bullish
 * @property {{value:number, trend:'UP'|'DOWN'|'SIDEWAYS'}} supertrend ATR-based Supertrend (5m)
 * @property {number} atr Average True Range (5m, price units) — real volatility, used for stop-loss/target sizing
 * @property {number} minutesToSquareOff minutes until the daily forced square-off (15:15 IST) — 0 once it's passed
 * @property {'pre-market'|'opening'|'mid-day'|'closing'|'after-square-off'} sessionPhase where we are in today's intraday session
 * @property {{support:number, resistance:number}} levels
 * @property {string} sector
 * @property {number} sectorRelativeStrength this stock's day momentum minus its sector peers' average, in percent
 * @property {string} niftySentiment
 * @property {string[]} news up to 5 recent headlines (stock-specific + broad market), newest first
 * @property {{totalClosed:number, winRate:number|null, avgPnl:number|null}} trackRecord this symbol's own past AI-triggered trade performance
 */

/**
 * @typedef {Object} OptionSideSnapshot
 * @property {string} tradingSymbol the exact Groww option contract symbol
 * @property {number} premium the contract's own current LTP
 * @property {number} premiumAtr 0 if the contract doesn't have enough own candle history yet
 * @property {{totalClosed:number, winRate:number|null, avgPnl:number|null}} trackRecord keyed by (underlying, this side's optionType)
 */

/**
 * @typedef {Object} OptionsIndicatorSnapshot
 * @property {string} underlying e.g. 'NIFTY'
 * @property {number} strike
 * @property {Date} expiry
 * @property {number} lotSize
 * @property {number} spotLtp underlying index's current price
 * @property {OptionSideSnapshot} ce the CALL contract at this strike/expiry
 * @property {OptionSideSnapshot} pe the PUT contract at this strike/expiry
 * @property {number} rsi RSI(14) computed on the UNDERLYING's candles
 * @property {{macd:number, signal:number, histogram:number}} macd on the UNDERLYING's candles
 * @property {number} volumeRatio on the UNDERLYING's candles
 * @property {'UP'|'DOWN'|'SIDEWAYS'} trendShortTerm 5m underlying trend
 * @property {'UP'|'DOWN'|'SIDEWAYS'} trendMediumTerm 15m underlying trend
 * @property {'UP'|'DOWN'|'SIDEWAYS'} trendLongTerm 30m underlying trend
 * @property {{value:number, trend:'UP'|'DOWN'|'SIDEWAYS'}} psar on the UNDERLYING
 * @property {{value:number, trend:'UP'|'DOWN'|'SIDEWAYS'}} supertrend on the UNDERLYING
 * @property {number} atr on the UNDERLYING (price units, not premium units)
 * @property {number} minutesToSquareOff
 * @property {'pre-market'|'opening'|'mid-day'|'closing'|'after-square-off'} sessionPhase
 * @property {{support:number, resistance:number}} levels on the UNDERLYING
 * @property {string} niftySentiment
 * @property {string[]} news
 */

/**
 * @typedef {Object} AiOptionsDecision
 * @property {'BUY'|'WAIT'} action BUY always means "buy calls/puts to open" — exits are handled by positionGuardianJob/squareOffJob like any other position, not by this decision
 * @property {'CE'|'PE'|null} optionType required when action is BUY
 * @property {number} quantity total contract quantity (a multiple of lotSize), 0 for WAIT
 * @property {number} stopLoss absolute premium value
 * @property {number} target absolute premium value
 * @property {string} reason
 * @property {number} confidence 0-100
 * @property {string} [justification]
 * @property {ScoreBreakdown} [scoreBreakdown]
 */

/**
 * @typedef {Object} RiskConfigShape
 * @property {number} maxLossPerDay
 * @property {number} maxLossPerTrade
 * @property {number} maxTradesPerDay
 * @property {number} maxCapitalPerTradePercent
 * @property {boolean} killSwitchEngaged
 */

/**
 * @typedef {Object} CanTradeResult
 * @property {boolean} allowed
 * @property {string} [reason]
 */

/**
 * @typedef {Object} TradingModeStatus
 * @property {TradingMode} mode
 * @property {BrokerName} activeBroker
 * @property {boolean} liveAvailable
 * @property {boolean} liveEnabledEnv
 * @property {boolean} hasCredential
 * @property {boolean} killSwitchEngaged
 * @property {boolean} autoTradingInLive
 */

export {};
