const mongoose = require('mongoose');
const Review = require('../models/review');
const Order = require('../models/order');
const Venue = require('../models/Venue');
const Studio = require('../models/studio');
const Cuisine = require('../models/Cuisine');

const REVIEWABLE = ['venue', 'studio', 'dish'];

/**
 * Resolves what is being reviewed and returns its display name.
 *
 * The name is stored on the review because an item can be delisted later, and
 * a review that then reads "reviewed (deleted)" is worse than useless in the
 * moderation queue.
 */
const resolveItem = async (itemType, itemId) => {
  if (itemType === 'venue') {
    const venue = await Venue.findById(itemId).select('name').lean();
    return venue?.name || null;
  }
  if (itemType === 'studio') {
    const studio = await Studio.findById(itemId).select('name').lean();
    return studio?.name || null;
  }
  if (itemType === 'dish') {
    const category = await Cuisine.findOne({ 'dishes._id': itemId }, { 'dishes.$': 1 }).lean();
    return category?.dishes?.[0]?.name || null;
  }
  return null;
};

/**
 * Recomputes an item's headline rating from its published reviews.
 *
 * The score-only `ratings[]` arrays on Venue/Studio/Cuisine are no longer
 * written to — a number nobody can explain is not feedback. `rating` and
 * `totalRatings` stay on the documents because every listing card reads them,
 * so they are kept current from here instead.
 */
const recomputeItemRating = async (itemType, itemId) => {
  const [summary] = await Review.aggregate([
    { $match: { itemType, itemId: new mongoose.Types.ObjectId(String(itemId)), verified: true } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const rating = summary ? Math.round(summary.average * 10) / 10 : 0;
  const totalRatings = summary ? summary.count : 0;

  if (itemType === 'venue') {
    await Venue.updateOne({ _id: itemId }, { $set: { rating, totalRatings } });
  } else if (itemType === 'studio') {
    await Studio.updateOne({ _id: itemId }, { $set: { rating, totalRatings } });
  } else if (itemType === 'dish') {
    await Cuisine.updateOne(
      { 'dishes._id': itemId },
      { $set: { 'dishes.$.rating': rating, 'dishes.$.totalRatings': totalRatings } },
    );
  }

  return { rating, totalRatings };
};

exports.recomputeItemRating = recomputeItemRating;

/**
 * Posts a review.
 *
 * With no `itemType` it is a review of the company, which is what every
 * review was before. With one it is attached to a specific venue, studio or
 * dish — and if the user has a paid order containing that item, the review is
 * marked as coming from a real booking.
 */
exports.postReviews = async (req, res) => {
  const userId = req.user.id;
  const { rating, comment, itemType, itemId } = req.body;

  try {
    const score = Number(rating);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return res.status(400).json({
        success: false,
        message: "Give a rating between 1 and 5 before posting."
      });
    }

    const review = { user: userId, rating: score, comment };

    if (itemType || itemId) {
      if (!REVIEWABLE.includes(itemType)) {
        return res.status(400).json({
          success: false,
          message: `itemType must be one of: ${REVIEWABLE.join(', ')}`
        });
      }
      if (!mongoose.Types.ObjectId.isValid(itemId)) {
        return res.status(400).json({ success: false, message: 'A valid itemId is required' });
      }

      const itemName = await resolveItem(itemType, itemId);
      if (!itemName) {
        return res.status(404).json({ success: false, message: `That ${itemType} no longer exists` });
      }

      // One review per person per item — a second is an edit, not a new voice.
      const existing = await Review.findOne({ user: userId, itemType, itemId });
      if (existing) {
        existing.rating = score;
        existing.comment = comment;
        existing.verified = false; // an edited review goes back through moderation
        await existing.save();
        await recomputeItemRating(itemType, itemId);
        return res.status(200).json({
          success: true,
          message: "Your review has been updated and is awaiting publication."
        });
      }

      review.itemType = itemType;
      review.itemId = itemId;
      review.itemName = itemName;

      /* Did they actually book this? Only a paid order counts, so a review
         cannot be bought by adding something to a cart. */
      const booked = await Order.findOne({
        userId,
        paymentStatus: { $in: ['partial', 'completed'] },
        'items.itemId': itemId,
        'items.itemType': itemType,
      }).select('_id').lean();

      if (booked) review.fromOrder = booked._id;
    }

    await new Review(review).save();

    return res.status(200).json({
      success: true,
      message: "Thanks — your review will appear once it has been checked."
    });
  } catch (error) {
    console.error('Error posting review:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * GET /api/reviews/item/:itemType/:itemId — the published reviews of one
 * listing, with the distribution behind the headline score.
 */
exports.getItemReviews = async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    if (!REVIEWABLE.includes(itemType) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ success: false, message: 'Unknown item' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const objectId = new mongoose.Types.ObjectId(String(itemId));

    const [reviews, breakdown] = await Promise.all([
      Review.find({ itemType, itemId: objectId, verified: true })
        .populate('user', 'name profileImage')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Review.aggregate([
        { $match: { itemType, itemId: objectId, verified: true } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
    ]);

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum = 0;
    for (const row of breakdown) {
      counts[row._id] = row.count;
      total += row.count;
      sum += row._id * row.count;
    }

    return res.status(200).json({
      success: true,
      message: 'Reviews fetched successfully',
      data: {
        reviews: reviews.map((r) => ({ ...r, verifiedBooking: Boolean(r.fromOrder) })),
        summary: {
          average: total ? Math.round((sum / total) * 10) / 10 : null,
          total,
          counts,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching item reviews:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /api/reviews/reviewable — what this customer has been to and can now
 * write about. Drives the "how was it?" prompt after an event.
 */
exports.getReviewableItems = async (req, res) => {
  try {
    const userId = req.user.id;

    const orders = await Order.find({
      userId,
      paymentStatus: { $in: ['partial', 'completed'] },
      status: { $ne: 'cancelled' },
    })
      .select('items createdAt')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const written = await Review.find({ user: userId, itemId: { $ne: null } })
      .select('itemType itemId')
      .lean();
    const done = new Set(written.map((r) => `${r.itemType}:${r.itemId}`));

    const seen = new Set();
    const pending = [];
    for (const order of orders) {
      for (const item of order.items || []) {
        const key = `${item.itemType}:${item.itemId}`;
        if (seen.has(key) || done.has(key)) continue;
        // Nothing is reviewable before it has happened.
        if (item.bookedTill && new Date(item.bookedTill) > new Date()) continue;
        seen.add(key);
        pending.push({
          itemType: item.itemType,
          itemId: item.itemId,
          name: item.name,
          image: item.image,
          orderId: order._id,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Reviewable items fetched successfully',
      data: { items: pending },
    });
  } catch (error) {
    console.error('Error fetching reviewable items:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getAllReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const ratingFilter = req.query.rating;
    const filter = {};
    if (ratingFilter) filter.rating = ratingFilter;
    const reviews = await Review.find(filter)
      .populate('user', 'name profileImage verified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const totalReviews = await Review.countDocuments(filter);
    return res.status(200).json({
      success: true,
      message: "Reviews fetched successfully",
      data: {
        reviews,
        pagination: {
          totalReviews,
          currentPage: page,
          totalPages: Math.ceil(totalReviews / limit),
          limit
        }
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getVerifiedReviews = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const reviews = await Review.find({ verified: true })
      .populate('user', 'name profileImage')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.status(200).json({
      success: true,
      message: `Top ${limit} verified reviews fetched successfully`,
      data: reviews
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.getUnverifiedReviews = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const reviews = await Review.find({ verified: false })
      .populate('user', 'name profileImage')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.status(200).json({
      success: true,
      message: `Top ${limit} unverified reviews fetched successfully`,
      data: reviews
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.deleteReview = async (req, res) => {
  const { reviewId } = req.params;
  try {
    const deletedReview = await Review.findByIdAndDelete(reviewId);
    if (!deletedReview) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }
    if (deletedReview.itemType && deletedReview.itemId) {
      await recomputeItemRating(deletedReview.itemType, deletedReview.itemId);
    }
    return res.status(200).json({
      success: true,
      message: "Review deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

exports.toggleVerified = async (req, res) => {
  const reviewId = req.params.reviewId;
  try {
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }
    review.verified = !review.verified;
    await review.save();
    // The listing's headline score counts published reviews only.
    if (review.itemType && review.itemId) {
      await recomputeItemRating(review.itemType, review.itemId);
    }
    return res.status(200).json({
      success: true,
      message: `Review verified status updated to ${review.verified}`,
      verified: review.verified
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
