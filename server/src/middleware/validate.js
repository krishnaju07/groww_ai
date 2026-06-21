/**
 * Build an Express middleware that validates a request segment against a zod
 * schema. On success the parsed (and coerced) value replaces the original
 * `req[source]`. On failure it throws an Error with `.code = 'VALIDATION_ERROR'`
 * (mapped to HTTP 400 by the global error handler), with a concise message
 * summarizing the field issues.
 *
 * @param {import('zod').ZodTypeAny} schema  zod schema to validate against
 * @param {'body'|'query'|'params'} [source='body']  which request segment to validate
 * @returns {import('express').RequestHandler}
 */
export function validate(schema, source = 'body') {
  return function validateMiddleware(req, _res, next) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => {
          const path = i.path && i.path.length ? i.path.join('.') : source;
          return `${path}: ${i.message}`;
        })
        .join('; ');
      const err = new Error(`Validation failed — ${issues}`);
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    // Replace with parsed/coerced data so handlers get clean, typed values.
    req[source] = result.data;
    return next();
  };
}

export default validate;
