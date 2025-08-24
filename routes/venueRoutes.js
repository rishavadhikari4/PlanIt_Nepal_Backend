const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const upload = require("../middleware/multer");

const router = express.Router();

const venueController = require('../controllers/venueController');

router.post('/', authMiddleware, authorizeRoles("admin"), upload.single('image'), venueController.uploadVenue);

router.get('/', venueController.getAllVenues);

router.get('/search', venueController.searchVenues);

router.get('/:venueId', venueController.getVenuesById); // This now includes booked dates

router.patch('/:venueId', authMiddleware, authorizeRoles("admin"), upload.single('image'), venueController.updateVenue);

router.delete('/:venueId', authMiddleware, authorizeRoles("admin"), venueController.deleteVenue);



module.exports = router;
