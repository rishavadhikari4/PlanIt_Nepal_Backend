const express = require('express');
const Review = require('../models/review');
const User =  require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/',authMiddleware,async(req,res)=>{
    const userId = req.user.id;
    const {rating,comment} = req.body;
    const user = await User.findById(userId);
    try{
        if(!rating){
            return res.status(400).json({message:"Please fill up the rating before posting"});
        }
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const newReview = new Review({
            user:{
                _id:user._id,
                name:user.name,
            },
            rating,
            comment,
        });
        await newReview.save();
        res.status(200).json({message:"Review Sent Successfully"});
    }catch(err){
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/', async (req, res) => {
  try {
    const reviews = await Review.find()
      .sort({ createdAt: -1 })
      .limit(5);                
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id',async (req,res)=>{
  try{
    const deletedReview = await Review.findByIdAndDelete();
    if(!deletedReview){
      return res.status(404).json({message:"Reivew Not Found"});
    }
    res.status(200).json({message:"Review Deleted Successfully"});
  }catch(err){
    console.error(err);
    res.status(500).json({message:"Internal Server Error"});
  }
});



module.exports = router;