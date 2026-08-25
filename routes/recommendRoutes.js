const express = require('express');
const recommendController = require('../controllers/recommendController');
const { generalLimiter } = require('../utils/rateLimitters');

const router = express.Router();

/* The occasions this company runs, and what each one implies. */
router.get('/occasions', generalLimiter, recommendController.listOccasions);

/* One budget and a headcount, for any of the six occasions. */
router.get('/package', generalLimiter, recommendController.getOccasionPackage);

/* The original three-budget wedding planner, kept for the existing client. */
router.get('/wedding-package', generalLimiter, recommendController.getWeddingPackageRecommendation);

module.exports = router;