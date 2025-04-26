const express = require('express');
const Cart = require('../models/cart');
const authMiddleware = require('../middleware/middleware');


const router = express.Router();

router.post('/',authMiddleware,async(req , res)=>{
    try{
        const {name, image, quantity} = req.body;
        if(!name || !image || !quantity){
            return res.status(400).json({message:"Please fill all fields"});
        }
        const newCart = new Cart({
            userId: req.user.id,
            name,
            image,
            quantity
        });
        await newCart.save();

        const cartItems = await Cart.find({ userId: req.user.id });

        return res.status(200).json(cartItems);
    }catch(err){
        console.error("Error adding item to cart:", err);
        return res.status(500).json({message:"Internal server error"});
    }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const cartItems = await Cart.find({ userId: req.user.id });
    return res.status(200).json(cartItems);
  } catch (err) {
    console.error("Error fetching cart items:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

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