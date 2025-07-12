/**
 * @module models/cart
 * @description MongoDB schema model for shopping cart items
 * @requires mongoose
 */
const mongoose = require('mongoose');

/**
 * Cart item schema definition
 * 
 * @typedef {Object} CartItemSchema
 * @property {ObjectId} userId - Reference to the user who owns this cart item
 * @property {string} name - Name of the product/item
 * @property {string} price - Price of the item (stored as string)
 * @property {string} image - URL to the item's image
 * @property {number} quantity - Number of items in the cart
 */
const cartItemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  price:{
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
});

/**
 * Cart model compiled from the schema
 * @type {Model}
 */
const Cart = mongoose.model('CartItem', cartItemSchema);

module.exports = Cart;