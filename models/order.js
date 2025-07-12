/**
 * @module models/order
 * @description MongoDB schema model for customer orders
 * @requires mongoose
 */
const mongoose = require('mongoose');

/**
 * Order item schema definition for individual items in an order
 * 
 * @typedef {Object} OrderItemSchema
 * @property {string} name - Name of the ordered item
 * @property {number} price - Price of the ordered item
 * @property {string} image - URL to the ordered item's image
 * @property {number} quantity - Quantity of the item ordered
 */
const orderItemSchema = new mongoose.Schema({
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
    }
});

/**
 * Order schema definition for complete customer orders
 * 
 * @typedef {Object} OrderSchema
 * @property {ObjectId} userId - Reference to the user who placed the order
 * @property {string} status - Current status of the order (e.g., "pending", "processing", "completed", "cancelled")
 * @property {Array<OrderItemSchema>} items - Array of ordered items
 * @property {number} totalAmount - Total cost of the entire order
 * @property {Date} createdAt - Timestamp when the order was created (defaults to current time)
 */
const orderSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  status: { 
    type: String, 
    required: true 
  },
  items: [orderItemSchema], // Array of order items
  totalAmount: {
    type: Number,
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

/**
 * Order model compiled from the schema
 * @type {Model}
 */
module.exports = mongoose.model('Order', orderSchema);
