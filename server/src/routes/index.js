import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { stocksRoutes } from './stocks.routes.js';
import { optionsRoutes } from './options.routes.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { portfolioRoutes } from './portfolio.routes.js';
import { ordersRoutes } from './orders.routes.js';
import { tradesRoutes } from './trades.routes.js';
import { settingsRoutes } from './settings.routes.js';
import { riskRoutes } from './risk.routes.js';
import { aiRoutes } from './ai.routes.js';
import { brokersRoutes } from './brokers.routes.js';
import { backtestRoutes } from './backtest.routes.js';

export const apiRoutes = Router();

apiRoutes.use('/health', healthRoutes);
apiRoutes.use('/stocks', stocksRoutes);
apiRoutes.use('/options', optionsRoutes);
apiRoutes.use('/dashboard', dashboardRoutes);
apiRoutes.use('/portfolio', portfolioRoutes);
apiRoutes.use('/orders', ordersRoutes);
apiRoutes.use('/trades', tradesRoutes);
apiRoutes.use('/settings', settingsRoutes);
apiRoutes.use('/risk', riskRoutes);
apiRoutes.use('/ai', aiRoutes);
apiRoutes.use('/brokers', brokersRoutes);
apiRoutes.use('/backtest', backtestRoutes);
