/**
 * @module controllers/reviewController
 * @description Controller for managing user reviews and testimonials
 * @requires express
 * @requires ../models/review
 * @requires ../models/User
 * @requires ../middleware/authMiddleware
 */
const express = require('express');
const Review = require('../models/review');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route POST /api/reviews
 * @description Create a new review/testimonial from authenticated user
 * @access Private
 * @param {Object} req.body - Request body
 * @param {number} req.body.rating - Rating value (required)
 * @param {string} req.body.comment - Review text comment (optional)
 * @returns {Object} 200 - Success message
 * @returns {Object} 400 - Missing rating
 * @returns {Object} 404 - User not found
 * @returns {Object} 500 - Server error
 */
router.post('/', authMiddleware, async(req, res) => {
    const userId = req.user.id;
    const {rating, comment} = req.body;
    const user = await User.findById(userId);
    try {
        if(!rating) {
            return res.status(400).json({message: "Please fill up the rating before posting"});
        }
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const newReview = new Review({
            user: {
                _id: user._id,
                name: user.name,
                profileImage: user.profileImage,
            },
            rating,
            comment,
        });
        await newReview.save();
        res.status(200).json({message: "Review Sent Successfully"});
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * @route GET /api/reviews/all-reviews
 * @description Get all reviews (sorted by newest first)
 * @access Private
 * @returns {Array} 200 - Array of all review objects
 * @returns {Object} 500 - Server error
 */
router.get('/all-reviews', authMiddleware, async (req, res) => {
  try {
    const reviews = await Review.find()
      .sort({ createdAt: -1 });            
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route GET /api/reviews/verified-reviews
 * @description Get only verified reviews (sorted by newest first, limited to 6)
 * @access Public
 * @returns {Array} 200 - Array of verified review objects
 * @returns {Object} 500 - Server error
 */
router.get('/verified-reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ verified: true })  // only verified reviews
      .sort({ createdAt: -1 })
      .limit(6);
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route GET /api/reviews/unverified-reviews
 * @description Get only unverified reviews (sorted by newest first, limited to 5)
 * @access Public
 * @returns {Array} 200 - Array of unverified review objects
 * @returns {Object} 500 - Server error
 */
router.get('/unverified-reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ verified: false })  // only unverified reviews
      .sort({ createdAt: -1 })
      .limit(5);
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route DELETE /api/reviews/:id
 * @description Delete a review by ID
 * @access Private
 * @param {string} req.params.id - Review ID to delete
 * @returns {Object} 200 - Success message
 * @returns {Object} 404 - Review not found
 * @returns {Object} 500 - Server error
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deletedReview = await Review.findByIdAndDelete(req.params.id);
    if(!deletedReview) {
      return res.status(404).json({message: "Review Not Found"});
    }
    res.status(200).json({message: "Review Deleted Successfully"});
  } catch(err) {
    console.error(err);
    res.status(500).json({message: "Internal Server Error"});
  }
});

/**
 * @route PATCH /api/reviews/toggle-verified/:id
 * @description Toggle the verification status of a review (admin function)
 * @access Private
 * @param {string} req.params.id - Review ID to update
 * @returns {Object} 200 - Success message and new verification status
 * @returns {Object} 404 - Review not found
 * @returns {Object} 500 - Server error
 */
router.patch('/toggle-verified/:id', authMiddleware, async(req, res) => {
  const reviewId = req.params.id;
  try {
    const review = await Review.findById(reviewId);
    if(!review) {
      return res.status(404).json({message: "Review not found"});
    }
    review.verified = !review.verified;

    await review.save();
    res.status(200).json({
      message: `Review verified status updated to ${review.verified}`,
      verified: review.verified
    });
  } catch(err) {
    console.error(err);
    res.status(500).json({message: 'Server error'});
  }
});

module.exports = router;