/**
 * The contract every broker adapter (PaperBroker, GrowwBroker, ZerodhaBroker,
 * AngelOneBroker) implements — see types.js `BrokerAdapter` typedef for the full
 * method signatures. This file documents the contract and a couple of invariants
 * that aren't expressible in JSDoc alone:
 *
 * - `placeOrder`/`modifyOrder`/`cancelOrder` NEVER get called directly by routes,
 *   AI code, or the cron job — only orderService.placeOrder() and killSwitch.trip()
 *   are allowed to call a broker adapter's mutating methods. This is what makes the
 *   risk gate unbypassable: there is exactly one door into "place a real order".
 * - `cancelAllOrders`/`closeAllPositions` must not throw on an already-empty
 *   order book / position list — the kill switch calls these unconditionally
 *   across every connected broker and a throw would abort the trip for brokers
 *   later in the loop.
 * - Every method that hits a real broker's network API must translate that
 *   broker's error shape into a plain `Error` with a `.code` and rethrow — never
 *   swallow a failure silently (see the CLAUDE-provided reference plan's "handle
 *   API failures" requirement).
 *
 * @typedef {import('../../types.js').BrokerAdapter} BrokerAdapterShape
 */

export {};
