import { Router } from 'express';
import stocksRoutes from './stocks.routes.js';
import portfolioRoutes from './portfolio.routes.js';
import tradesRoutes from './trades.routes.js';
import settingsRoutes from './settings.routes.js';
import backtestRoutes from './backtest.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import tradingModeRoutes from './tradingMode.routes.js';

/**
 * Top-level API router. Mounted by server.js under `/api` (imported as `apiRouter`).
 * Each sub-router owns one resource group from §11.
 */
const router = Router();

router.use('/stocks', stocksRoutes);
router.use('/portfolio', portfolioRoutes);
router.use('/trades', tradesRoutes);
router.use('/settings', settingsRoutes);
router.use('/backtest', backtestRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/trading-mode', tradingModeRoutes);

export default router;
