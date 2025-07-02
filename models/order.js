const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
                    name: 
                    { type: String, 
                        required: true },
                    price:{
                        type:Number,
                        required:true
                    },
                    image: 
                    { type: String, 
                        required: true },
                    quantity: { 
                        type: Number, 
                        required: true }

});

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:{ type:String, required:true,},
  items: [orderItemSchema], // Array of order items
  totalAmount:{
    type:Number,
    required:true
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
