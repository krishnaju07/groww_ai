/**
 * @typedef {'BUY'|'SELL'|'HOLD'} SignalType
 * @typedef {'BUY'|'SELL'} TradeAction
 * @typedef {'manual'|'automatic'} TradeType
 * @typedef {'OPEN'|'CLOSED'} TradeStatus
 * @typedef {'paper'|'live'} TradingMode
 *
 * @typedef {Object} StockQuote
 * @property {string} symbol         canonical e.g. "RELIANCE", "NIFTY50"
 * @property {string} name
 * @property {number} price
 * @property {number} change          absolute vs previousClose
 * @property {number} changePercent
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} previousClose
 * @property {number} volume
 * @property {string} timestamp       ISO
 *
 * @typedef {Object} Candle
 * @property {string} date            "YYYY-MM-DD"
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} volume
 *
 * @typedef {Object} SignalIndicators
 * @property {number} rsi             0..100
 * @property {number} macd            histogram = MACD line - signal line
 * @property {number} momentum        % change over momentum window
 * @property {number} volumeRatio     current volume / avg(volume,20)
 * @property {number} sma20
 * @property {number} sma50
 *
 * @typedef {Object} AIModelVote
 * @property {string} name            model label, e.g. "Quant" | "Claude"
 * @property {SignalType} signal
 * @property {number} confidence      0..100
 * @property {string} reason
 *
 * @typedef {Object} AISignal
 * @property {string} symbol
 * @property {SignalType} signal      ensemble (blended) signal
 * @property {number} confidence      0..100 (blended)
 * @property {string} reason
 * @property {SignalIndicators} indicators
 * @property {AIModelVote[]} [models] per-model breakdown (Quant + optional Claude)
 * @property {string} generatedAt     ISO
 *
 * @typedef {Object} Trade
 * @property {string} id
 * @property {string} symbol
 * @property {TradeAction} action
 * @property {number} quantity
 * @property {number} price            execution price (incl. slippage)
 * @property {number} investmentAmount
 * @property {TradeType} tradeType
 * @property {string} [triggerReason]
 * @property {TradeStatus} status
 * @property {TradingMode} [mode]
 * @property {string} [brokerOrderId]
 * @property {number} [pnl]
 * @property {number} [pnlPercent]
 * @property {string} openedAt         ISO
 * @property {string} [closedAt]       ISO
 *
 * @typedef {Object} Position
 * @property {string} id
 * @property {string} symbol
 * @property {number} quantity
 * @property {number} avgBuyPrice
 * @property {number} currentPrice
 * @property {number} investedAmount
 * @property {number} currentValue
 * @property {number} unrealizedPnl
 * @property {number} unrealizedPnlPercent
 * @property {number} highestPriceSeen
 * @property {string} openedAt         ISO
 *
 * @typedef {Object} AutoInvestSettings
 * @property {boolean} enabled
 * @property {number} minConfidenceScore   0..100
 * @property {string} [lastExecutedAt]     ISO
 *
 * @typedef {Object} AutoExitSettings
 * @property {boolean} enabled
 * @property {number} stopLossPercent      0.5..20
 * @property {number} takeProfitPercent    0.5..50
 * @property {number} trailingStopPercent  0..10, 0 = disabled
 * @property {boolean} useAiExitSignal
 *
 * @typedef {Object} UserSettings
 * @property {string} userId
 * @property {number} minInvestment
 * @property {number} maxInvestment
 * @property {TradingMode} [tradingMode]
 * @property {AutoInvestSettings} autoInvest
 * @property {AutoExitSettings} autoExit
 * @property {string} updatedAt            ISO
 *
 * @typedef {Object} PortfolioSummary
 * @property {number} cashBalance
 * @property {number} investedValue        sum investedAmount of OPEN positions
 * @property {number} currentValue         sum currentValue of OPEN positions
 * @property {number} totalValue           cashBalance + currentValue
 * @property {number} totalPnl             realizedPnl + unrealized of open positions
 * @property {number} totalPnlPercent      totalPnl / initialCapital * 100
 * @property {number} dayPnl               sum (price-previousClose)*qty over open positions
 * @property {number} dayPnlPercent
 * @property {number} realizedPnl
 *
 * @typedef {Object} PortfolioResponse
 * @property {PortfolioSummary} summary
 * @property {Position[]} positions
 *
 * @typedef {Object} EquityPoint
 * @property {string} date                 ISO
 * @property {number} value
 *
 * @typedef {Object} DashboardData
 * @property {PortfolioSummary} summary
 * @property {EquityPoint[]} equityCurve
 * @property {AISignal[]} topSignals       top 3 by confidence (BUY/SELL preferred over HOLD)
 * @property {Trade[]} recentTrades        last 10
 * @property {{enabled:boolean,lastTrade?:{symbol:string,investmentAmount:number,at:string}}} autoInvest
 * @property {{enabled:boolean,activeRules:number}} autoExit
 *
 * @typedef {Object} BacktestParams
 * @property {string} symbol
 * @property {string} startDate            "YYYY-MM-DD"
 * @property {string} endDate              "YYYY-MM-DD"
 * @property {number} initialCapital
 * @property {number} perTradeAmount
 * @property {number} minConfidenceScore
 * @property {number} stopLossPercent
 * @property {number} takeProfitPercent
 * @property {number} trailingStopPercent
 *
 * @typedef {Object} BacktestTrade
 * @property {string} symbol
 * @property {TradeAction} action
 * @property {string} date                 "YYYY-MM-DD"
 * @property {number} price
 * @property {number} quantity
 * @property {number} [pnl]
 * @property {number} [pnlPercent]
 * @property {string} reason
 *
 * @typedef {Object} BacktestResult
 * @property {string} id
 * @property {BacktestParams} params
 * @property {number} totalReturnPercent
 * @property {number} finalCapital
 * @property {number} maxDrawdownPercent
 * @property {number} winRate              0..100
 * @property {number} totalTrades
 * @property {number} sharpeRatio
 * @property {EquityPoint[]} equityCurve
 * @property {BacktestTrade[]} trades
 * @property {string} createdAt            ISO
 *
 * @typedef {Object} TradingModeStatus
 * @property {TradingMode} mode
 * @property {boolean} liveAvailable
 * @property {boolean} liveEnabledEnv
 * @property {boolean} hasToken
 * @property {boolean} autoTradingInLive
 */
export {};
