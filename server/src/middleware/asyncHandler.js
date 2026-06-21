/**
 * Wrap an async Express route handler so any rejected promise is forwarded
 * to the global error middleware via `next(err)`.
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<any>} fn
 * @returns {import('express').RequestHandler}
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
