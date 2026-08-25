const mongoose = require('mongoose');

const dishRatingSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true,
    },
    ratedAt: {
        type: Date,
        default: Date.now,
    },
});

const dishSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
    },
    price: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    orderedCount: {
        type: Number,
        default: 0,
    },
    image: {
        type: String,
    },
    imageId: {
        type: String,
    },
    ratings: [dishRatingSchema],
    totalRatings: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });


const cuisineSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true
    },
    dishes: [dishSchema]
}, { timestamps: true });

/* The app addresses a category by its name — addDish looks one up and pushes
   into it — so the name has to be unique or dishes land in a random duplicate.
   `dishes._id` backs the lookup that resolves a dish when it is ordered.

   Note there is deliberately NO index on dishes.ratings.userId. A unique one
   existed in the database at one point and made a second dish impossible to
   insert, because every unrated dish indexes as null. */
cuisineSchema.index({ category: 1 }, { unique: true });
cuisineSchema.index({ "dishes._id": 1 });

const Cuisine = mongoose.model('Cuisine', cuisineSchema);

module.exports = Cuisine;