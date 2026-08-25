const Order = require('../models/order');
const { sendOrderConfirmationEmail } = require('../utils/emailHelper');
const {
  khalti,
  fonepay,
  fonepayDate,
  fonepayRequestDigest,
  fonepayResponseIsAuthentic,
} = require('../config/paymentGateways');

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:8080';

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

/** What this attempt is meant to collect, in rupees. */
const amountFor = (order, paymentAmountType) =>
  paymentAmountType === 'advance_payment'
    ? Math.round(order.totalAmount * 0.25)
    : Math.round(order.totalAmount);

const loadOwnedOrder = async (orderId, userId) => {
  const order = await Order.findById(orderId).populate('userId');
  if (!order) return { error: { status: 404, message: 'Order not found' } };
  if (order.userId._id.toString() !== userId) {
    return { error: { status: 403, message: 'You can only pay for your own orders' } };
  }
  return { order };
};

const confirmBookings = (order) => {
  order.items.forEach((item) => {
    if (item.itemType === 'venue' || item.itemType === 'studio') item.bookingStatus = 'confirmed';
  });
};

/**
 * The single place an order becomes paid. Every gateway funnels through here so
 * the money rules live in one function instead of once per provider.
 */
const settleOrder = async (order, { provider, amountPaid, transactionId }) => {
  const partial = order.paymentAmountType === 'advance_payment';

  order.paymentProvider = provider;
  order.paymentTransactionId = transactionId || order.paymentTransactionId;
  order.paidAmount = parseFloat(amountPaid.toFixed(2));
  order.remainingAmount = parseFloat((order.totalAmount - order.paidAmount).toFixed(2));
  order.paymentStatus = partial ? 'partial' : 'completed';
  order.status = 'confirmed';
  order.paidAt = new Date();
  confirmBookings(order);
  await order.save();

  setImmediate(async () => {
    try {
      await sendOrderConfirmationEmail(
        { order, user: order.userId },
        partial ? '25_percent' : 'full_payment',
      );
    } catch (err) {
      console.error('Order confirmation email failed:', err.message);
    }
  });

  return order;
};

const publicOrder = (order) => ({
  _id: order._id,
  status: order.status,
  totalAmount: order.totalAmount,
  paidAmount: order.paidAmount,
  remainingAmount: order.remainingAmount,
  paymentStatus: order.paymentStatus,
  paymentType: order.paymentType,
  paymentProvider: order.paymentProvider,
  paymentAmountType: order.paymentAmountType,
  paymentTransactionId: order.paymentTransactionId,
  items: order.items,
});

/* ------------------------------------------------------------------ *
 * Khalti — ePayment (KPG-2)
 * ------------------------------------------------------------------ */

const khaltiCall = async (path, body) => {
  const res = await fetch(`${khalti.baseUrl}/api/v2/epayment/${path}/`, {
    method: 'POST',
    headers: {
      Authorization: `key ${khalti.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || Object.values(data).flat().join(' ') || `HTTP ${res.status}`;
    throw new Error(`Khalti: ${detail}`);
  }
  return data;
};

const initiateKhalti = async (order, rupees) => {
  const paisa = rupees * 100;
  if (paisa < khalti.minAmountPaisa) {
    throw Object.assign(new Error('Khalti needs a payment of at least Rs 10.'), { status: 400 });
  }

  const data = await khaltiCall('initiate', {
    return_url: `${FRONTEND_URL()}/payment/callback`,
    website_url: FRONTEND_URL(),
    amount: paisa,
    purchase_order_id: order._id.toString(),
    purchase_order_name: `PlanIt Nepal order ${order._id.toString().slice(-8).toUpperCase()}`,
    customer_info: {
      name: order.userId.name || 'PlanIt Nepal customer',
      email: order.userId.email,
      phone: order.userId.number || order.userId.phone || undefined,
    },
  });

  order.paymentReference = data.pidx;
  await order.save();

  return { redirectUrl: data.payment_url, reference: data.pidx };
};

const verifyKhalti = async (order, { pidx }) => {
  if (!pidx || pidx !== order.paymentReference) {
    return { settled: false, status: 'mismatch', message: 'This payment does not belong to the order.' };
  }

  const lookup = await khaltiCall('lookup', { pidx });
  if (lookup.status !== 'Completed') {
    return { settled: false, status: lookup.status, message: `Khalti reports the payment as ${lookup.status}.` };
  }

  const expectedPaisa = amountFor(order, order.paymentAmountType) * 100;
  if (Number(lookup.total_amount) < expectedPaisa) {
    return {
      settled: false,
      status: 'amount_mismatch',
      message: 'The amount Khalti collected is less than the amount due.',
    };
  }

  return {
    settled: true,
    amountPaid: Number(lookup.total_amount) / 100,
    transactionId: lookup.transaction_id,
  };
};

/* ------------------------------------------------------------------ *
 * Fonepay — merchant redirect (RBS)
 * ------------------------------------------------------------------ */

const initiateFonepay = async (order, rupees) => {
  // PRN must be unique per attempt, so a retry after a failure gets a fresh one.
  const prn = `${order._id.toString()}-${Date.now().toString(36)}`;
  const amount = rupees.toFixed(2);
  const dt = fonepayDate();
  const r1 = `PlanIt Nepal order ${order._id.toString().slice(-8).toUpperCase()}`;
  const r2 = order.paymentAmountType === 'advance_payment' ? '25% advance' : 'Full payment';
  const returnUrl = `${FRONTEND_URL()}/payment/callback`;

  const dv = fonepayRequestDigest({
    PID: fonepay.merchantCode,
    MD: 'P',
    PRN: prn,
    AMT: amount,
    CRN: 'NPR',
    DT: dt,
    R1: r1,
    R2: r2,
  });

  const params = new URLSearchParams({
    PID: fonepay.merchantCode,
    MD: 'P',
    PRN: prn,
    AMT: amount,
    CRN: 'NPR',
    DT: dt,
    R1: r1,
    R2: r2,
    DV: dv,
    RU: returnUrl,
  });

  order.paymentReference = prn;
  await order.save();

  return { redirectUrl: `${fonepay.baseUrl}/merchantRequest?${params.toString()}`, reference: prn };
};

const verifyFonepay = async (order, query) => {
  const { PRN, PS, RC, UID, P_AMT } = query;

  if (!PRN || PRN !== order.paymentReference) {
    return { settled: false, status: 'mismatch', message: 'This payment does not belong to the order.' };
  }

  if (!fonepayResponseIsAuthentic(query)) {
    return { settled: false, status: 'bad_signature', message: 'The payment response could not be verified.' };
  }

  if (String(PS).toLowerCase() !== 'true') {
    return { settled: false, status: 'failed', message: `Fonepay declined the payment (code ${RC}).` };
  }

  const expected = amountFor(order, order.paymentAmountType);
  const paid = Number(P_AMT);
  if (!Number.isFinite(paid) || paid + 0.01 < expected) {
    return {
      settled: false,
      status: 'amount_mismatch',
      message: 'The amount Fonepay collected is less than the amount due.',
    };
  }

  return { settled: true, amountPaid: paid, transactionId: UID };
};

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

/**
 * POST /api/payments/start-payment
 * body: { orderId, provider: 'khalti' | 'fonepay' | 'cash', paymentAmount?: '25_percent' | 'full_payment' }
 *
 * `paymentAmount` is kept for the older clients that signalled cash by leaving
 * it off entirely.
 */
exports.startPayment = async (req, res) => {
  const { orderId, paymentAmount } = req.body;
  const provider = req.body.provider || (paymentAmount ? 'khalti' : 'cash');

  try {
    const { order, error } = await loadOwnedOrder(orderId, req.user.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (order.paymentStatus === 'completed') {
      return res.status(409).json({ success: false, message: 'This order is already paid in full.' });
    }

    /* ---- Cash after service: nothing leaves the building ---- */
    if (provider === 'cash') {
      order.paymentType = 'cash_after_service';
      order.paymentProvider = 'cash';
      order.paymentAmountType = null;
      order.status = 'confirmed';
      order.paymentStatus = 'pending';
      order.remainingAmount = order.totalAmount;
      confirmBookings(order);
      await order.save();

      setImmediate(async () => {
        try {
          await sendOrderConfirmationEmail({ order, user: order.userId }, 'cash_payment');
        } catch (err) {
          console.error('Order confirmation email failed:', err.message);
        }
      });

      return res.status(200).json({
        success: true,
        provider: 'cash',
        redirectUrl: null,
        message: 'Order confirmed. Payment is collected after the event.',
        order: publicOrder(order),
      });
    }

    /* ---- Gateway payment ---- */
    if (!['25_percent', 'full_payment'].includes(paymentAmount)) {
      return res.status(400).json({
        success: false,
        message: "Choose how much to pay: '25_percent' or 'full_payment'.",
      });
    }

    const gateway = provider === 'khalti' ? khalti : provider === 'fonepay' ? fonepay : null;
    if (!gateway) {
      return res.status(400).json({ success: false, message: `Unknown payment method: ${provider}` });
    }
    if (!gateway.enabled) {
      return res.status(503).json({
        success: false,
        message: `${provider === 'khalti' ? 'Khalti' : 'Fonepay'} is not available right now. Try another payment method.`,
      });
    }

    order.paymentType = 'advance_payment';
    order.paymentProvider = provider;
    order.paymentAmountType =
      paymentAmount === '25_percent' ? 'advance_payment' : 'full_payment';
    await order.save();

    const rupees = amountFor(order, order.paymentAmountType);
    const { redirectUrl, reference } =
      provider === 'khalti'
        ? await initiateKhalti(order, rupees)
        : await initiateFonepay(order, rupees);

    return res.status(200).json({
      success: true,
      provider,
      redirectUrl,
      reference,
      amount: rupees,
      message: 'Payment session created.',
    });
  } catch (err) {
    console.error('startPayment failed:', err);
    return res.status(err.status || 502).json({
      success: false,
      message: err.status ? err.message : 'The payment gateway did not respond. Please try again.',
    });
  }
};

/**
 * POST /api/payments/verify
 * body: { orderId, provider, ...gateway return query }
 *
 * Called once the customer lands back on /payment/callback. The browser's query
 * string is only a hint — the order is settled from what the gateway confirms.
 */
exports.verifyPayment = async (req, res) => {
  const { orderId, provider, ...query } = req.body;

  try {
    const { order, error } = await loadOwnedOrder(orderId, req.user.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    // Landing on the callback twice (refresh, back button) must not double-pay.
    if (order.paymentStatus === 'completed' || order.paymentStatus === 'partial') {
      return res.status(200).json({
        success: true,
        alreadySettled: true,
        message: 'This payment is already recorded.',
        order: publicOrder(order),
      });
    }

    const result =
      provider === 'khalti'
        ? await verifyKhalti(order, query)
        : provider === 'fonepay'
          ? await verifyFonepay(order, query)
          : { settled: false, status: 'unknown_provider', message: `Unknown payment method: ${provider}` };

    if (!result.settled) {
      return res.status(200).json({
        success: false,
        paymentStatus: result.status,
        message: result.message,
        order: publicOrder(order),
      });
    }

    await settleOrder(order, {
      provider,
      amountPaid: result.amountPaid,
      transactionId: result.transactionId,
    });

    return res.status(200).json({
      success: true,
      paymentStatus: order.paymentStatus,
      message:
        order.paymentStatus === 'partial'
          ? 'Advance received. Your dates are held.'
          : 'Payment received in full.',
      order: publicOrder(order),
    });
  } catch (err) {
    console.error('verifyPayment failed:', err);
    return res.status(502).json({
      success: false,
      message: 'We could not confirm the payment with the gateway. Please check your orders in a moment.',
    });
  }
};

/**
 * GET /api/payments/status/:orderId
 * Lets the client re-read where an order stands without starting anything.
 */
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { order, error } = await loadOwnedOrder(req.params.orderId, req.user.id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    return res.status(200).json({
      success: true,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      order: publicOrder(order),
    });
  } catch (err) {
    console.error('checkPaymentStatus failed:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/payments/methods
 * Which gateways the server can actually reach, so the checkout only offers
 * what is configured rather than failing at the redirect.
 */
exports.availableMethods = (_req, res) => {
  res.status(200).json({
    success: true,
    methods: {
      khalti: khalti.enabled,
      fonepay: fonepay.enabled,
      cash: true,
    },
  });
};
