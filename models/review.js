const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    comment: {
        type: String,
    },
    verified: {
        type: Boolean,
        default: false
    }
}, {timestamps: true});

/* The public list reads verified reviews newest-first; the admin list reads
   both. One review per user is not enforced, so `user` is a plain index. */
reviewSchema.index({ verified: 1, createdAt: -1 });
reviewSchema.index({ user: 1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;