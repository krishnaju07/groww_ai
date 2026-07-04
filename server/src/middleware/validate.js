/**
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} [source]
 * @returns {import('express').RequestHandler}
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const e = new Error(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      e.status = 400;
      e.code = 'VALIDATION_ERROR';
      return next(e);
    }
    req[source] = result.data;
    next();
  };
}
