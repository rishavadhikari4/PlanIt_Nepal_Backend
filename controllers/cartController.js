/**
 * @module controllers/cartController
 * @description Controller for shopping cart operations
 * @requires express
 * @requires ../models/cart
 * @requires ../middleware/authMiddleware
 */
const express = require('express');
const Cart = require('../models/cart');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route POST /api/cart
 * @description Add a new item to the authenticated user's cart
 * @access Private
 * @param {Object} req.body - Request body
 * @param {string} req.body.name - Item name
 * @param {number} req.body.price - Item price
 * @param {string} req.body.image - Item image URL
 * @param {number} req.body.quantity - Item quantity
 * @returns {Object} 200 - Array of all cart items for the user
 * @returns {Object} 400 - Missing required fields
 * @returns {Object} 401 - Unauthorized (handled by middleware)
 * @returns {Object} 500 - Server error
 */
router.post('/', authMiddleware, async(req, res) => {
    try {
        const {name, price, image, quantity} = req.body;
        if(!name || !price || !image || !quantity) {
            return res.status(400).json({message: "Please fill all fields"});
        }
        const newCart = new Cart({
            userId: req.user.id,
            name,
            price,
            image,
            quantity
        });
        await newCart.save();

        const cartItems = await Cart.find({ userId: req.user.id });

        return res.status(200).json(cartItems);
    } catch(err) {
        console.error("Error adding item to cart:", err);
        return res.status(500).json({message: "Internal server error"});
    }
});

/**
 * @route GET /api/cart
 * @description Get all items in the authenticated user's cart
 * @access Private
 * @returns {Object} 200 - Array of all cart items for the user
 * @returns {Object} 401 - Unauthorized (handled by middleware)
 * @returns {Object} 500 - Server error
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.user.id });

    return res.status(200).json(cartItems);
  } catch (err) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @route DELETE /api/cart/:id
 * @description Remove an item from the authenticated user's cart
 * @access Private
 * @param {string} req.params.id - Cart item ID to delete
 * @returns {Object} 200 - Updated array of all cart items for the user
 * @returns {Object} 404 - Cart item not found
 * @returns {Object} 401 - Unauthorized (handled by middleware)
 * @returns {Object} 500 - Server error
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const cartItem = await Cart.findByIdAndDelete(req.params.id);
        if (!cartItem) {
            return res.status(404).json({ message: "Cart item not found" });
        }
        // Fetch updated cart items for the user
        const updatedCart = await Cart.find({ userId: req.user.id });
        return res.status(200).json(updatedCart);
    } catch (err) {
        console.error("Error deleting cart item:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;