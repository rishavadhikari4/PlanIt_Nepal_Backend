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
    },
    /* Why one line was cancelled while the rest of the order stands — a venue
       can fall through without the studio going with it. */
    statusNote: {
        type: String,
        trim: true,
        maxlength: 300,
        default: null
    },
    statusChangedAt: {
        type: Date,
        default: null
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
  /* How many people are being fed. Catering is priced per plate, so this is
     the multiplier for every dish on the order — it is held once here rather
     than typed into each line. */
  guestCount: {
    type: Number,
    min: 1,
    default: null
  },
  /* Set when the order is cancelled, so the reason survives the status. */
  cancelledAt: {
    type: Date,
    default: null
  },
  cancelledBy: {
    type: String,
    enum: ['customer', 'admin', null],
    default: null
  },
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: 500,
    default: null
  },
  /* Money returned after a cancellation. `refundedAmount` never exceeds
     paidAmount; the controller is the only thing that writes it. */
  refundedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  refundStatus: {
    type: String,
    enum: ['none', 'due', 'processing', 'refunded'],
    default: 'none'
  },
  refundedAt: {
    type: Date,
    default: null
  },
  refundReference: {
    type: String,
    default: null
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
/* Availability search sweeps every live booking that overlaps a date window,
   across the whole catalogue, so it needs the dates leading. */
orderSchema.index({ "items.bookedFrom": 1, "items.bookedTill": 1, "items.itemType": 1 });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
