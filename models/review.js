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
    /* What is being reviewed. A review with no subject is a review of the
       company as a whole, which is what every existing row is — hence the
       null default rather than a required field. Item reviews replace the
       score-only `ratings[]` arrays on Venue/Studio/Cuisine: a two-star
       rating nobody can explain is not feedback.

       `itemName` is denormalised so the admin list and the customer's own
       history still read correctly after an item is deleted. */
    itemType: {
        type: String,
        enum: ['venue', 'studio', 'dish', null],
        default: null
    },
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    itemName: {
        type: String,
        default: null
    },
    /* Set when the review is written against an order the user actually
       paid for. Shown as "Verified booking" — distinct from `verified`,
       which is the moderator letting it be published. */
    fromOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        default: null
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
/* A listing page asks for the published reviews of one item, newest first. */
reviewSchema.index({ itemType: 1, itemId: 1, verified: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;