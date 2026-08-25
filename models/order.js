const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    itemType: {
        type: String,
        enum: ['venue', 'dish','studio'],
        required: true
    },
    name: { 
        type: String, 
        required: true 
    },
    price: {
        type: Number,
        required: true
    },
    image: { 
        type: String, 
        required: true 
    },
    quantity: { 
        type: Number, 
        required: true 
    },
    bookedFrom: {
        type: Date,
        required: false,
        default: null
    },
    bookedTill: {
        type: Date,
        required: false,
        default: null
    },
    bookingStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: function() {
            return (this.itemType === 'venue' || this.itemType === 'studio') ? 'pending' : undefined;
        }
    }
});

const orderSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['draft', 'pending', 'processing', 'confirmed', 'completed', 'cancelled'],
    default: 'draft' 
  },
  items: [orderItemSchema], 
  totalAmount: {
    type: Number,
    required: true
  },
  paymentType: {
    type: String,
    enum: ['cash_after_service', 'advance_payment'],
    default: 'cash_after_service'
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'completed'],
    default: 'pending'
  },
  // Which gateway the customer was sent to for this order.
  paymentProvider: {
    type: String,
    enum: ['khalti', 'fonepay', 'cash', null],
    default: null
  },
  // How much of the total this payment attempt covers.
  paymentAmountType: {
    type: String,
    enum: ['advance_payment', 'full_payment', null],
    default: null
  },
  // Our reference handed to the gateway: Khalti's pidx, or the Fonepay PRN.
  paymentReference: {
    type: String,
    default: null,
    index: true
  },
  // The gateway's own transaction id, returned once the payment clears.
  paymentTransactionId: {
    type: String,
    default: null
  },
  paidAt: {
    type: Date,
    default: null
  },
  // Retained so existing Stripe-era orders still render their payment id.
  stripePaymentIntentId: {
    type: String,
    default: null
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});


/* The hot paths:
     userId + createdAt   a customer's own order list
     status + createdAt   the admin list, filtered by status
     items.itemId/type    the double-booking check, which runs on every
                          attempt to add a dated item to an order
   `paymentReference` is declared on the field itself, for gateway callbacks. */
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ "items.itemId": 1, "items.itemType": 1, "items.bookingStatus": 1 });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
