const express = require('express');
const Venue = require('../models/Venue');
const authMiddleware = require('../middleware/authMiddleware');

const upload = require('../middleware/multer');
const {uploadToCloudinary,deleteFromCloudinary} = require('../config/cloudinaryConfig');

const router = express.Router();

// Create a new venue
router.post('/', upload.single('image'),async (req, res) =>{
    try{
        const{name,location,description} = req.body;
        if(!name || !location || !description || !req.file){
            return res.status(400).json({message: 'Please fill all fields'});
        }
        const result = await uploadToCloudinary(req.file.buffer);
        const newVenue = new Venue({
            name,
            location,
            description,
            image : result.secure_url,
            imageId: result.public_id

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
router.patch('/:id', upload.single('image'),async (req, res) => {
    const { name, location, description} = req.body;
    try {
        const venue = await Venue.findById(req.params.id);
        if(!venue){
            return res.status(404).json({message:"Venue not found"});
        }
        if(venue.imageId){
            await deleteFromCloudinary(venue.imageId);
        }
        let imageUrl = venue.image;
        let imageId = venue.imageId;

        if (req.file) {
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
                    image:imageUrl,
                    imageId:imageId 
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
// Delete a venue by ID
router.delete('/:id', async (req, res) => {
    try {
        const venue =  await Venue.findById(req.params.id);

        if(!venue){
            return res.status(404).json({message:"Venue not found"});
        }

        if(venue.imageId){
            await deleteFromCloudinary(venue.imageId);
        }

        await Venue.findByIdAndDelete(req.params.id);

        return res.status(200).json({ message: 'Venue deleted successfully' });
    } catch (err) {
        console.error('Error deleting venue:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;

