/** @type {import('express').ErrorRequestHandler} */
export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.path} →`, err);
  } else {
    console.warn(`[error] ${req.method} ${req.path} → ${code}: ${err.message}`);
  }
  res.status(status).json({ success: false, error: err.message || 'Internal error', code });
}
