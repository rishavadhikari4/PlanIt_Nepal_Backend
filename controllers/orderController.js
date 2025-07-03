const express =  require('express');
const Cart = require('../models/cart');
const Order = require('../models/order');

const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.user.id });

    if (cartItems.length === 0) {
      return res.status(404).json({ message: "No items in cart to order" });
    }

    const orderItems = cartItems.map(item => ({
      name: item.name,
      price: item.price,
      image: item.image,
      quantity: item.quantity
    }));

    const totalAmount = cartItems.reduce((total, item) => {
      return total + (parseFloat(item.price) * item.quantity); }, 0);


    const newOrder = new Order({
      userId: req.user.id,
      status:"pending",
      items: orderItems,
      totalAmount
    });

    await newOrder.save(); // Save the order
    await Cart.deleteMany({ userId: req.user.id }); // Clear the cart after order

    return res.status(200).json({ message: "Order placed successfully", order: newOrder });
  } catch (err) {
    console.error("Error placing order:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});


router.get('/user-order', authMiddleware, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id });
        return res.status(200).json(orders);
    } catch (err) {
        console.error("Error fetching orders:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

// Admin route to get all orders

router.get('/all-orders',authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find().populate('userId', 'email name');
    return res.status(200).json(orders);
  } catch (err) {
    console.error("Error fetching all orders:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});


router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Error deleting order:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post('/:id', authMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    if (!status || !["pending", "processing", "completed","cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid or missing status" });
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json({
      message: "Order status updated successfully",
      order: updatedOrder
    });

  } catch (err) {
    console.error("Error updating order status:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});



module.exports = router;