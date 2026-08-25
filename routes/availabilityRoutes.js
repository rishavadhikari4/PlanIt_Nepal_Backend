const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/authorizeRoles');
const availabilityController = require('../controllers/availabilityController');

const router = express.Router();

/* Public: what is free on a date, across venues and studios at once. */
router.get('/', availabilityController.searchAvailability);

/* Staff: one month of everything that is held, for the "what's on that
   Saturday" question that used to mean opening records one at a time. */
router.get('/calendar', authMiddleware, authorizeRoles('admin'), availabilityController.monthCalendar);

module.exports = router;
