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

module.exports = router;
