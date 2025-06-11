const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user:{
        _id:{
            type:mongoose.Schema.Types.ObjectId,
            ref:`User`,
            required:true,
           },
        name:{
            type:String,
            required:true,
        }
    },
    rating:{
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    comment:{
        type: String,
    },
    verified:{
        type:Boolean,
        default:false
    }
},{timestamps: true});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;