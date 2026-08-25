const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/authorizeRoles');
const paymentController = require('../controllers/paymentController');

const router = express.Router();
const customer = [authMiddleware, authorizeRoles('customer')];

// Which gateways this deployment can actually reach.
router.get('/methods', paymentController.availableMethods);

// Send the customer to Khalti / Fonepay, or confirm a cash-after-service order.
router.post('/start-payment', ...customer, paymentController.startPayment);

// Confirm what the gateway says happened, once the customer lands back.
router.post('/verify', ...customer, paymentController.verifyPayment);

// Read where an order stands, without starting anything.
router.get('/status/:orderId', ...customer, paymentController.checkPaymentStatus);

/* Gateway callbacks. No auth: these are server-to-server calls from Khalti and
   Fonepay, and neither can carry our access token. Safe because neither
   handler trusts its payload — Khalti is re-checked through its lookup API and
   Fonepay against its own HMAC. The body only names the order to go verify. */
router.post('/webhook/khalti', paymentController.khaltiWebhook);
router.post('/webhook/fonepay', paymentController.fonepayWebhook);
router.get('/webhook/fonepay', paymentController.fonepayWebhook);

// Settle anything the gateways never told us about.
router.get('/reconcile', authMiddleware, authorizeRoles('admin'), paymentController.runReconciliation);

module.exports = router;
