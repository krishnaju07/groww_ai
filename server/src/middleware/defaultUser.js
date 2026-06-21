import { DEFAULT_USER_ID } from '../config/constants.js';

/**
 * No-auth shim: attach the fixed demo user id to every request.
 * The whole app runs as a single seeded paper-trading user.
 * @type {import('express').RequestHandler}
 */
export function defaultUser(req, _res, next) {
  req.userId = DEFAULT_USER_ID;
  next();
}

export default defaultUser;
