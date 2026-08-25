/*
 * Blocks MongoDB operator injection.
 *
 * Controllers pass request values straight into queries — `User.findOne({ email })`
 * with `email` from req.body being the clearest case. Because Express parses
 * JSON into real objects, a client can send:
 *
 *     { "email": { "$ne": null }, "password": "anything" }
 *
 * and `email` arrives as a query operator rather than a string. On login that
 * selects an arbitrary account; on forgot-password it sends a reset link for
 * one. Anywhere a value reaches a query unchecked, the same trick applies.
 *
 * This rejects the request outright rather than silently stripping the keys,
 * because nothing legitimate in this API sends a key beginning with `$`, and a
 * request that tries is worth failing loudly.
 *
 * Express 5 exposes req.query through a getter, so the objects are inspected
 * rather than reassigned.
 */

const MAX_DEPTH = 12;

const findBadKey = (value, depth = 0) => {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const bad = findBadKey(entry, depth + 1);
      if (bad) return bad;
    }
    return null;
  }

  for (const key of Object.keys(value)) {
    // `$` starts an operator; a dot reaches into a subdocument path.
    if (key.startsWith('$') || key.includes('.')) return key;
    // __proto__ / constructor / prototype guard against prototype pollution.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return key;

    const bad = findBadKey(value[key], depth + 1);
    if (bad) return bad;
  }
  return null;
};

const sanitize = (req, res, next) => {
  for (const source of ['body', 'query', 'params']) {
    const bad = findBadKey(req[source]);
    if (bad) {
      return res.status(400).json({
        success: false,
        message: `Request contains a disallowed field name: ${bad}`,
      });
    }
  }
  next();
};

/**
 * Escapes regex metacharacters before user input is used in a $regex query.
 *
 * Two problems without it. First, input like `.*` matches everything, so a
 * filter can be widened past what the caller should see. Second, a pattern
 * like `(a+)+$` backtracks catastrophically and pins the CPU — a one-request
 * denial of service.
 */
const escapeRegex = (value) =>
  String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds a safe case-insensitive "contains" filter, capped in length so an
 * enormous pattern cannot be used to burn CPU either.
 */
const containsFilter = (value, max = 128) => ({
  $regex: escapeRegex(String(value).trim().slice(0, max)),
  $options: 'i',
});

module.exports = { sanitize, escapeRegex, containsFilter };
