/**
 * Shared JSDoc shapes. Mirrored (subset, presentation-relevant fields) in
 * client/src/types.js — keep both in sync when a shape changes.
 */

/** @typedef {'paper'|'groww'|'zerodha'|'angelone'} BrokerName */
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
 * @typedef {Object} AiDecision
 * @property {AiAction} action
 * @property {number} quantity
 * @property {number} stopLoss
 * @property {number} target
 * @property {string} reason
 * @property {number} confidence   0-100
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
 * @property {{support:number, resistance:number}} levels
 * @property {string} sector
 * @property {number} sectorRelativeStrength this stock's day momentum minus its sector peers' average, in percent
 * @property {string} niftySentiment
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
