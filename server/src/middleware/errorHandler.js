/**
 * HTTP status mapping for known business/validation error codes.
 * 404 for "not found" style codes; 400 for client/business errors.
 * Anything unrecognized becomes INTERNAL / 500.
 * @type {Record<string, number>}
 */
const CODE_STATUS = {
  VALIDATION_ERROR: 400,
  SYMBOL_NOT_FOUND: 404,
  INSUFFICIENT_FUNDS: 400,
  INSUFFICIENT_AMOUNT: 400,
  NO_POSITION: 400,
  NOT_FOUND: 404,
  LIVE_TRADING_DISABLED: 403,
  LIVE_AUTO_DISABLED: 403,
  BROKER_ERROR: 502,
  INTERNAL: 500,
};

/**
 * Global Express error middleware. Converts thrown errors into the standard
 * envelope `{ success: false, error, code }`. A handler/service throws an Error
 * with an attached `.code` (one of the §11 codes); unknown errors map to
 * INTERNAL / 500.
 *
 * Must be registered LAST, after all routes.
 *
 * @param {Error & { code?: string, status?: number }} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, _req, res, _next) {
  const code = err && typeof err.code === 'string' && CODE_STATUS[err.code] ? err.code : 'INTERNAL';
  const status = err && typeof err.status === 'number' ? err.status : CODE_STATUS[code] || 500;

  const error =
    code === 'INTERNAL'
      ? err && err.message
        ? err.message
        : 'Internal server error'
      : err.message || code;

  if (code === 'INTERNAL') {
    console.error('[error]', err && err.stack ? err.stack : err);
  }

  res.status(status).json({ success: false, error, code });
}

export default errorHandler;
