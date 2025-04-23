const express = require('express');
const Venue = require('../models/Venue');
const authMiddleware = require('../middleware/middleware');

const router = express.Router();    

// Create a new venue
router.post('/', async (req, res) =>{
    try{
        const{name,location,description,image} = req.body;
        if(!name || !location || !description || !image){
            return res.status(400).json({message: 'Please fill all fields'});
        }
        const newVenue = new Venue({
            name,
            location,
            description,
            image
        });
        await newVenue.save();
        return res.status(201).json({message: 'Venue created successfully', venue: newVenue});
    }catch(err){
        console.error('Error creating venue:', err);
        return res.status(500).json({message: 'Internal server error'});
    }
});
// Get all venues
router.get('/', async (req, res) => {
    try {
        const venues = await Venue.find();
        return res.status(200).json({ message: 'Venues fetched successfully', venues });
    } catch (err) {
        console.error('Error fetching venues:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
// Get a single venue by ID
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
// Update a venue by ID
router.patch('/:id', async (req, res) => {
    try {
        const { name, location, description, image } = req.body;
        const updatedVenue = await Venue.findByIdAndUpdate(
            req.params.id,
            { $set: { name, location, description, image } },
            { new: true }
        );
        if (!updatedVenue) {
            return res.status(404).json({ message: 'Venue not found' });
        }
        return res.status(200).json({ message: 'Venue updated successfully', venue: updatedVenue });
    } catch (err) {
        console.error('Error updating venue:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
// Delete a venue by ID
router.delete('/:id', async (req, res) => {
    try {
        const deletedVenue = await Venue.findByIdAndDelete(req.params.id);
        if (!deletedVenue) {
            return res.status(404).json({ message: 'Venue not found' });
        }
        return res.status(200).json({ message: 'Venue deleted successfully' });
    } catch (err) {
        console.error('Error deleting venue:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;

