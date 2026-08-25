/*
 * End-to-end check of the payment handlers with Mongo and the network stubbed.
 *   node test_payment_flow.js
 *
 * Proves the parts that decide whether an order becomes paid: the Khalti and
 * Fonepay redirect is built correctly, a good return settles the order, and a
 * tampered or failed return does not.
 */
const assert = require('assert');
const crypto = require('crypto');

process.env.PAYMENT_MODE = 'sandbox';
process.env.FRONTEND_URL = 'https://planitnepal.test';
process.env.KHALTI_SECRET_KEY = 'test-khalti-key';
process.env.FONEPAY_MERCHANT_CODE = 'TEST_MERCHANT';
process.env.FONEPAY_SECRET_KEY = 'test-shared-secret';

/* ---------- stub the model and the mailer before the controller loads ---------- */
let currentOrder = null;

const stub = (relPath, exports) => {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

stub('./models/order', {
  findById: () => ({ populate: async () => currentOrder }),
});
stub('./utils/emailHelper', { sendOrderConfirmationEmail: async () => {} });

const controller = require('./controllers/paymentController');

/* ---------- test doubles ---------- */
const USER_ID = '64b7f0000000000000000001';
const ORDER_ID = '64b7f0000000000000000abc';

const makeOrder = (over = {}) => ({
  _id: { toString: () => ORDER_ID },
  userId: { _id: { toString: () => USER_ID }, email: 'guest@example.com', name: 'Guest' },
  totalAmount: 100000,
  paidAmount: 0,
  remainingAmount: undefined,
  paymentStatus: 'pending',
  paymentType: 'cash_after_service',
  paymentAmountType: null,
  paymentProvider: null,
  paymentReference: null,
  paymentTransactionId: null,
  status: 'draft',
  items: [
    { itemType: 'venue', name: 'Hyatt lawn', price: 80000, quantity: 1, bookingStatus: 'pending' },
    { itemType: 'dish', name: 'Newari set', price: 500, quantity: 40 },
  ],
  save: async function () {
    return this;
  },
  ...over,
});

const mockRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

const call = async (handler, { body = {}, params = {} } = {}) => {
  const res = mockRes();
  await handler({ body, params, user: { id: USER_ID } }, res);
  return res;
};

const main = async () => {

/* ================================================================== *
 * Cash after service
 * ================================================================== */
currentOrder = makeOrder();
let res = await call(controller.startPayment, {
  body: { orderId: ORDER_ID, provider: 'cash' },
});
assert.strictEqual(res.statusCode, 200);
assert.strictEqual(res.body.success, true);
assert.strictEqual(res.body.redirectUrl, null);
assert.strictEqual(currentOrder.status, 'confirmed');
assert.strictEqual(currentOrder.paymentStatus, 'pending');
assert.strictEqual(currentOrder.remainingAmount, 100000);
// A venue booking is held the moment the order is confirmed.
assert.strictEqual(currentOrder.items[0].bookingStatus, 'confirmed');

/* ================================================================== *
 * Khalti — advance payment
 * ================================================================== */
const khaltiCalls = [];
global.fetch = async (url, init) => {
  khaltiCalls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
  if (url.endsWith('/initiate/')) {
    return { ok: true, json: async () => ({ pidx: 'PIDX123', payment_url: 'https://dev.khalti.com/pay/PIDX123' }) };
  }
  return {
    ok: true,
    json: async () => ({ status: 'Completed', total_amount: 2500000, transaction_id: 'KHTXN99' }),
  };
};

currentOrder = makeOrder();
res = await call(controller.startPayment, {
  body: { orderId: ORDER_ID, provider: 'khalti', paymentAmount: '25_percent' },
});
assert.strictEqual(res.statusCode, 200);
assert.strictEqual(res.body.redirectUrl, 'https://dev.khalti.com/pay/PIDX123');
assert.strictEqual(res.body.amount, 25000);
assert.strictEqual(currentOrder.paymentReference, 'PIDX123');
assert.strictEqual(currentOrder.paymentAmountType, 'advance_payment');

const initiate = khaltiCalls[0];
assert.strictEqual(initiate.auth, 'key test-khalti-key');
assert.strictEqual(initiate.body.amount, 2500000); // rupees -> paisa
assert.strictEqual(initiate.body.return_url, 'https://planitnepal.test/payment/callback');
assert.ok(initiate.url.startsWith('https://dev.khalti.com/'), 'sandbox host in sandbox mode');

// The customer comes back; the server confirms with Khalti, not with the query.
res = await call(controller.verifyPayment, {
  body: { orderId: ORDER_ID, provider: 'khalti', pidx: 'PIDX123', status: 'Completed' },
});
assert.strictEqual(res.body.success, true);
assert.strictEqual(currentOrder.paymentStatus, 'partial');
assert.strictEqual(currentOrder.status, 'confirmed');
assert.strictEqual(currentOrder.paidAmount, 25000);
assert.strictEqual(currentOrder.remainingAmount, 75000);
assert.strictEqual(currentOrder.paymentTransactionId, 'KHTXN99');

// Landing on the callback twice must not double-settle.
const before = { ...currentOrder };
res = await call(controller.verifyPayment, {
  body: { orderId: ORDER_ID, provider: 'khalti', pidx: 'PIDX123' },
});
assert.strictEqual(res.body.alreadySettled, true);
assert.strictEqual(currentOrder.paidAmount, before.paidAmount);

/* ---- Khalti says the payment was NOT completed ---- */
global.fetch = async (url) =>
  url.endsWith('/initiate/')
    ? { ok: true, json: async () => ({ pidx: 'PIDX404', payment_url: 'https://dev.khalti.com/pay/PIDX404' }) }
    : { ok: true, json: async () => ({ status: 'User canceled', total_amount: 0 }) };

currentOrder = makeOrder();
await call(controller.startPayment, {
  body: { orderId: ORDER_ID, provider: 'khalti', paymentAmount: 'full_payment' },
});
res = await call(controller.verifyPayment, {
  // The browser claims success; Khalti disagrees, and Khalti wins.
  body: { orderId: ORDER_ID, provider: 'khalti', pidx: 'PIDX404', status: 'Completed' },
});
assert.strictEqual(res.body.success, false);
assert.strictEqual(currentOrder.paymentStatus, 'pending');
assert.strictEqual(currentOrder.status, 'draft');

/* ---- Khalti collected less than we asked for ---- */
global.fetch = async (url) =>
  url.endsWith('/initiate/')
    ? { ok: true, json: async () => ({ pidx: 'PIDXLOW', payment_url: 'https://x/' }) }
    : { ok: true, json: async () => ({ status: 'Completed', total_amount: 1000, transaction_id: 'T' }) };

currentOrder = makeOrder();
await call(controller.startPayment, {
  body: { orderId: ORDER_ID, provider: 'khalti', paymentAmount: 'full_payment' },
});
res = await call(controller.verifyPayment, {
  body: { orderId: ORDER_ID, provider: 'khalti', pidx: 'PIDXLOW' },
});
assert.strictEqual(res.body.success, false);
assert.strictEqual(res.body.paymentStatus, 'amount_mismatch');
assert.strictEqual(currentOrder.paymentStatus, 'pending');

/* ================================================================== *
 * Fonepay — full payment
 * ================================================================== */
currentOrder = makeOrder();
res = await call(controller.startPayment, {
  body: { orderId: ORDER_ID, provider: 'fonepay', paymentAmount: 'full_payment' },
});
assert.strictEqual(res.statusCode, 200);

const redirect = new URL(res.body.redirectUrl);
assert.strictEqual(redirect.host, 'dev-clientapi.fonepay.com');
assert.strictEqual(redirect.pathname, '/api/merchantRequest');
assert.strictEqual(redirect.searchParams.get('PID'), 'TEST_MERCHANT');
assert.strictEqual(redirect.searchParams.get('MD'), 'P');
assert.strictEqual(redirect.searchParams.get('AMT'), '100000.00');
assert.strictEqual(redirect.searchParams.get('CRN'), 'NPR');
assert.strictEqual(redirect.searchParams.get('RU'), 'https://planitnepal.test/payment/callback');
assert.match(redirect.searchParams.get('DV'), /^[0-9a-f]{128}$/);

const prn = redirect.searchParams.get('PRN');
assert.strictEqual(prn, currentOrder.paymentReference);
assert.ok(prn.startsWith(ORDER_ID), 'PRN carries the order id so the callback can recover it');

const signBack = (r) =>
  crypto
    .createHmac('sha512', 'test-shared-secret')
    .update([r.PRN, r.PID, r.PS, r.RC, r.UID, r.BC, r.INI, r.P_AMT, r.R_AMT].join(','))
    .digest('hex');

const good = {
  PRN: prn,
  PID: 'TEST_MERCHANT',
  PS: 'true',
  RC: 'successful',
  UID: 'FP-778899',
  BC: 'NICENPKA',
  INI: '9800000001',
  P_AMT: '100000.00',
  R_AMT: '100000.00',
};

/* ---- a tampered response is refused ---- */
res = await call(controller.verifyPayment, {
  body: { orderId: ORDER_ID, provider: 'fonepay', ...good, P_AMT: '1.00', DV: signBack(good) },
});
assert.strictEqual(res.body.success, false);
assert.strictEqual(res.body.paymentStatus, 'bad_signature');
assert.strictEqual(currentOrder.paymentStatus, 'pending');

/* ---- an unsigned response is refused ---- */
res = await call(controller.verifyPayment, {
  body: { orderId: ORDER_ID, provider: 'fonepay', ...good },
});
assert.strictEqual(res.body.success, false);
assert.strictEqual(res.body.paymentStatus, 'bad_signature');

/* ---- a declined-but-genuine response is refused ---- */
const declined = { ...good, PS: 'false', RC: 'failed' };
res = await call(controller.verifyPayment, {
  body: { orderId: ORDER_ID, provider: 'fonepay', ...declined, DV: signBack(declined) },
});
assert.strictEqual(res.body.success, false);
assert.strictEqual(res.body.paymentStatus, 'failed');
assert.strictEqual(currentOrder.paymentStatus, 'pending');

/* ---- the genuine, successful response settles the order ---- */
res = await call(controller.verifyPayment, {
  body: { orderId: ORDER_ID, provider: 'fonepay', ...good, DV: signBack(good) },
});
assert.strictEqual(res.body.success, true);
assert.strictEqual(currentOrder.paymentStatus, 'completed');
assert.strictEqual(currentOrder.status, 'confirmed');
assert.strictEqual(currentOrder.paidAmount, 100000);
assert.strictEqual(currentOrder.remainingAmount, 0);
assert.strictEqual(currentOrder.paymentTransactionId, 'FP-778899');
assert.strictEqual(currentOrder.items[0].bookingStatus, 'confirmed');

/* ================================================================== *
 * Guards
 * ================================================================== */

/* ---- someone else's order ---- */
currentOrder = makeOrder({
  userId: { _id: { toString: () => 'someone-else' }, email: 'x@y.z', name: 'X' },
});
res = await call(controller.startPayment, {
  body: { orderId: ORDER_ID, provider: 'khalti', paymentAmount: 'full_payment' },
});
assert.strictEqual(res.statusCode, 403);

/* ---- an amount we do not recognise ---- */
currentOrder = makeOrder();
res = await call(controller.startPayment, {
  body: { orderId: ORDER_ID, provider: 'khalti', paymentAmount: 'half' },
});
assert.strictEqual(res.statusCode, 400);

/* ---- an already-paid order cannot be charged again ---- */
currentOrder = makeOrder({ paymentStatus: 'completed' });
res = await call(controller.startPayment, {
  body: { orderId: ORDER_ID, provider: 'khalti', paymentAmount: 'full_payment' },
});
assert.strictEqual(res.statusCode, 409);

/* ---- an unconfigured gateway is reported, not redirected to ---- */
delete require.cache[require.resolve('./config/paymentGateways')];
delete require.cache[require.resolve('./controllers/paymentController')];
process.env.FONEPAY_SECRET_KEY = '';
const noFonepay = require('./controllers/paymentController');
currentOrder = makeOrder();
res = await call(noFonepay.startPayment, {
  body: { orderId: ORDER_ID, provider: 'fonepay', paymentAmount: 'full_payment' },
});
assert.strictEqual(res.statusCode, 503);

const methodsRes = mockRes();
noFonepay.availableMethods({}, methodsRes);
assert.deepStrictEqual(methodsRes.body.methods, { khalti: true, fonepay: false, cash: true });

  console.log('payment flow checks passed');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
