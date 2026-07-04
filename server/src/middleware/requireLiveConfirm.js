/**
 * Normalizes the client's "REAL MONEY" confirmation flag onto the request.
 * The actual enforcement (is this order even live, is confirmation required)
 * happens in orderService.placeOrder — the sole choke point to a broker — so a
 * missing/false flag here can never be bypassed by calling a different route.
 */
export function requireLiveConfirm(req, _res, next) {
  req.body.confirmRealMoney = req.body.confirmRealMoney === true;
  next();
}
