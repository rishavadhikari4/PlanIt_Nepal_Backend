const express =  require('express');
const Cart = require('../models/cart');
const Order = require('../models/order');

const authMiddleware = require('../middleware/middleware');
const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.user.id });

    if (cartItems.length === 0) {
      return res.status(404).json({ message: "No items in cart to order" });
    }

    const orderItems = cartItems.map(item => ({
      name: item.name,
      image: item.image,
      quantity: item.quantity
    }));

    const newOrder = new Order({
      userId: req.user.id,
      items: orderItems
    });

    await newOrder.save(); // Save the order
    await Cart.deleteMany({ userId: req.user.id }); // Clear the cart after order

    return res.status(200).json({ message: "Order placed successfully", order: newOrder });
  } catch (err) {
    console.error("Error placing order:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});


router.get('/', authMiddleware, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id });
        return res.status(200).json(orders);
    } catch (err) {
        console.error("Error fetching orders:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;