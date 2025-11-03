const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const upload = require("../middleware/multer");

const venueController = require('../controllers/venueController');

const router = express.Router();

router.post('/', authMiddleware, authorizeRoles("admin"), upload.single('image'), venueController.uploadVenue);

router.get('/search', venueController.searchVenues);
router.get('/', venueController.getAllVenues);

router.patch('/:venueId', authMiddleware, authorizeRoles("admin"), upload.single('image'), venueController.updateVenue);

router.post('/:venueId/photos', authMiddleware, authorizeRoles('admin'), upload.array('photos', 10), venueController.addVenuePhotos);

router.get('/:venueId', venueController.getVenuesById);


router.delete('/:venueId', authMiddleware, authorizeRoles("admin"), venueController.deleteVenue);



module.exports = router;
