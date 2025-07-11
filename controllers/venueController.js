/**
 * @module controllers/venueController
 * @description Handles all venue-related operations
 * @requires express
 * @requires ../models/Venue
 * @requires ../middleware/authMiddleware
 * @requires ../middleware/multer
 * @requires ../config/cloudinaryConfig
 */
const express = require('express');
const Venue = require('../models/Venue');
const authMiddleware = require('../middleware/authMiddleware');

const upload = require('../middleware/multer');
const {uploadToCloudinary,deleteFromCloudinary} = require('../config/cloudinaryConfig');

const router = express.Router();

/**
 * @route POST /api/venues
 * @description Create a new venue with image upload
 * @access Private (Admin only)
 * @param {Object} req.body - Request body
 * @param {string} req.body.name - Venue name
 * @param {string} req.body.location - Venue location
 * @param {string} req.body.description - Venue description
 * @param {number} req.body.price - Venue price
 * @param {File} req.file - Venue image file
 * @returns {Object} 201 - Created venue object
 * @returns {Object} 400 - Missing required fields
 * @returns {Object} 500 - Server error
 */
router.post('/', upload.single('image'), authMiddleware, async (req, res) => {
    try {
        const {name, location, description, price} = req.body;
        if(!name || !location || !description || !req.file || !price) {
            return res.status(400).json({message: 'Please fill all fields'});
        }
        const result = await uploadToCloudinary(req.file.buffer);
        const newVenue = new Venue({
            name,
            location,
            description,
            price,
            image : result.secure_url,
            imageId: result.public_id
        });
        await newVenue.save();
        return res.status(201).json({message: 'Venue created successfully', venue: newVenue});
    } catch(err) {
        console.error('Error creating venue:', err);
        return res.status(500).json({message: 'Internal server error'});
    }
});

/**
 * @route GET /api/venues
 * @description Get all venues
 * @access Public
 * @returns {Object} 200 - Array of all venues
 * @returns {Object} 500 - Server error
 */
router.get('/', async (req, res) => {
    try {
        const venues = await Venue.find();
        return res.status(200).json({ message: 'Venues fetched successfully', venues });
    } catch (err) {
        console.error('Error fetching venues:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * @route GET /api/venues/:id
 * @description Get a specific venue by ID
 * @access Public
 * @param {string} req.params.id - Venue ID
 * @returns {Object} 200 - Venue object
 * @returns {Object} 404 - Venue not found
 * @returns {Object} 500 - Server error
 */
router.get('/:id', async (req, res) => {
    try {
        const venue = await Venue.findById(req.params.id);
        if (!venue) {
            return res.status(404).json({ message: 'Venue not found' });
        }
        return res.status(200).json({ message: 'Venue fetched successfully', venue });
    } catch (err) {
        console.error('Error fetching venue:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * @route PATCH /api/venues/:id
 * @description Update a venue by ID, including optional image update
 * @access Private (Admin only)
 * @param {string} req.params.id - Venue ID
 * @param {Object} req.body - Request body
 * @param {string} [req.body.name] - Updated venue name
 * @param {string} [req.body.location] - Updated venue location
 * @param {string} [req.body.description] - Updated venue description
 * @param {number} [req.body.price] - Updated venue price
 * @param {File} [req.file] - Updated venue image file
 * @returns {Object} 200 - Updated venue object
 * @returns {Object} 404 - Venue not found
 * @returns {Object} 500 - Server error
 */
router.patch('/:id', upload.single('image'), authMiddleware, async (req, res) => {
    const { name, location, description, price } = req.body;
    try {
        const venue = await Venue.findById(req.params.id);
        if(!venue){
            return res.status(404).json({message:"Venue not found"});
        }
        
        let imageUrl = venue.image;
        let imageId = venue.imageId;

        if (req.file) {
            // Delete old image if it exists
            if(venue.imageId){
                await deleteFromCloudinary(venue.imageId);
            }
            // Upload new image
            const result = await uploadToCloudinary(req.file.buffer);
            imageUrl = result.secure_url;
            imageId = result.public_id;
        }
        
        const updatedVenue = await Venue.findByIdAndUpdate(
            req.params.id,
            { 
                $set: { 
                    name,
                    location,
                    description,
                    price,
                    image: imageUrl,
                    imageId: imageId 
                } 
            },
            { new: true }
        );
        
        return res.status(200).json({ message: 'Venue updated successfully', venue: updatedVenue });
    } catch (err) {
        console.error('Error updating venue:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * @route DELETE /api/venues/:id
 * @description Delete a venue by ID, including associated image
 * @access Private (Admin only)
 * @param {string} req.params.id - Venue ID
 * @returns {Object} 200 - Success message
 * @returns {Object} 404 - Venue not found
 * @returns {Object} 500 - Server error
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const venue = await Venue.findById(req.params.id);

        if(!venue){
            return res.status(404).json({message:"Venue not found"});
        }

        // Delete image from Cloudinary if it exists
        if(venue.imageId){
            await deleteFromCloudinary(venue.imageId);
        }

        // Delete venue from database
        await Venue.findByIdAndDelete(req.params.id);

        return res.status(200).json({ message: 'Venue deleted successfully' });
    } catch (err) {
        console.error('Error deleting venue:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;

