/**
 * @module models/review
 * @description MongoDB schema model for user reviews and testimonials
 * @requires mongoose
 */
const mongoose = require('mongoose');

/**
 * Review schema definition
 * 
 * @typedef {Object} ReviewSchema
 * @property {Object} user - Information about the user who submitted the review
 * @property {ObjectId} user._id - Reference to the user in the User collection
 * @property {string} user.name - Name of the user who submitted the review
 * @property {string} [user.profileImage] - Optional URL to the user's profile image
 * @property {number} rating - Review rating (1-5 stars)
 * @property {string} [comment] - Optional text comment with the review
 * @property {boolean} verified - Whether the review has been verified/approved by admin
 * @property {Date} createdAt - Automatically generated timestamp when review is created
 * @property {Date} updatedAt - Automatically generated timestamp when review is updated
 */
const reviewSchema = new mongoose.Schema({
    user: {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        profileImage: {
            type: String,
        },
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

/**
 * Review model compiled from the schema
 * @type {Model}
 */
const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;