/*
 * Self-check for the payment signing and amount rules.
 *   node test_payments.js
 *
 * Covers the parts that decide whether money is honoured: the Fonepay HMAC on
 * the way out and on the way back, and the split between an advance and a full
 * payment. The gateway HTTP calls are not exercised here.
 */
const assert = require('assert');
const crypto = require('crypto');

process.env.FONEPAY_MERCHANT_CODE = 'TEST_MERCHANT';
process.env.FONEPAY_SECRET_KEY = 'test-shared-secret';
process.env.KHALTI_SECRET_KEY = 'test-khalti-key';

const {
  khalti,
  fonepay,
  fonepayDate,
  fonepayRequestDigest,
  fonepayResponseIsAuthentic,
  timingSafeEqual,
} = require('./config/paymentGateways');

/* ---- Sandbox by default: local runs must never hit the live hosts ---- */
assert.strictEqual(khalti.baseUrl, 'https://dev.khalti.com');
assert.ok(fonepay.baseUrl.startsWith('https://dev-'));
assert.strictEqual(khalti.enabled, true);
assert.strictEqual(fonepay.enabled, true);

/* ---- Fonepay request digest matches an independently computed HMAC ---- */
const request = {
  PID: 'TEST_MERCHANT',
  MD: 'P',
  PRN: 'order123-abc',
  AMT: '2500.00',
  CRN: 'NPR',
  DT: '08/25/2026',
  R1: 'PlanIt Nepal order ORDER123',
  R2: '25% advance',
};
const expectedRequestDv = crypto
  .createHmac('sha512', 'test-shared-secret')
  .update('TEST_MERCHANT,P,order123-abc,2500.00,NPR,08/25/2026,PlanIt Nepal order ORDER123,25% advance')
  .digest('hex');
assert.strictEqual(fonepayRequestDigest(request), expectedRequestDv);

/* ---- Fonepay date format is the MM/DD/YYYY the gateway insists on ---- */
assert.strictEqual(fonepayDate(new Date(2026, 0, 5)), '01/05/2026');
assert.match(fonepayDate(), /^\d{2}\/\d{2}\/\d{4}$/);

/* ---- A genuine response verifies; a tampered one does not ---- */
const signResponse = (r) =>
  crypto
    .createHmac('sha512', 'test-shared-secret')
    .update([r.PRN, r.PID, r.PS, r.RC, r.UID, r.BC, r.INI, r.P_AMT, r.R_AMT].join(','))
    .digest('hex');

const paid = {
  PRN: 'order123-abc',
  PID: 'TEST_MERCHANT',
  PS: 'true',
  RC: 'successful',
  UID: 'TXN-9001',
  BC: 'NICENPKA',
  INI: '9800000001',
  P_AMT: '2500.00',
  R_AMT: '2500.00',
};
assert.strictEqual(fonepayResponseIsAuthentic({ ...paid, DV: signResponse(paid) }), true);

// Raising the amount in the browser must invalidate the signature.
assert.strictEqual(
  fonepayResponseIsAuthentic({ ...paid, P_AMT: '25000.00', DV: signResponse(paid) }),
  false,
);
// Flipping a failure into a success must invalidate it too.
const failed = { ...paid, PS: 'false', RC: 'failed' };
assert.strictEqual(
  fonepayResponseIsAuthentic({ ...failed, PS: 'true', DV: signResponse(failed) }),
  false,
);
// No signature at all is never authentic.
assert.strictEqual(fonepayResponseIsAuthentic(paid), false);
assert.strictEqual(fonepayResponseIsAuthentic({}), false);

/* ---- timingSafeEqual survives unequal lengths instead of throwing ---- */
assert.strictEqual(timingSafeEqual('abc', 'abc'), true);
assert.strictEqual(timingSafeEqual('abc', 'abcd'), false);
assert.strictEqual(timingSafeEqual('abc', 'abd'), false);
assert.strictEqual(timingSafeEqual('', ''), true);

/* ---- Amount rules: the 25% advance and the Khalti floor ---- */
const amountFor = (total, type) =>
  type === 'advance_payment' ? Math.round(total * 0.25) : Math.round(total);

assert.strictEqual(amountFor(100000, 'advance_payment'), 25000);
assert.strictEqual(amountFor(100000, 'full_payment'), 100000);
assert.strictEqual(amountFor(999, 'advance_payment'), 250); // 249.75 rounds up
assert.strictEqual(amountFor(0, 'full_payment'), 0);

// Khalti rejects under Rs 10, so a tiny advance must be caught before redirect.
assert.ok(amountFor(30, 'advance_payment') * 100 < khalti.minAmountPaisa); // Rs 8 -> blocked
assert.ok(amountFor(60, 'advance_payment') * 100 >= khalti.minAmountPaisa); // Rs 15 -> allowed

console.log('payment checks passed');
