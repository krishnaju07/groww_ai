import { DEFAULT_USER_ID } from '../config/constants.js';

/** Single-user app, no auth — attaches the seeded default user id to every request. */
export function defaultUser(req, _res, next) {
  req.userId = DEFAULT_USER_ID;
  next();
}
