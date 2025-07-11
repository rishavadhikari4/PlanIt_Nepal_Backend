/**
 * @module controllers/decorationController
 * @description Handles all decoration-related operations
 * @requires express
 * @requires ../models/Decoration
 * @requires ../middleware/authMiddleware
 * @requires ../middleware/multer
 * @requires ../config/cloudinaryConfig
 */
const express = require('express');
const Decoration = require('../models/Decoration');
const authMiddleware = require('../middleware/authMiddleware');

const {uploadToCloudinary,deleteFromCloudinary} = require('../config/cloudinaryConfig');
const upload = require('../middleware/multer');

const router = express.Router();

/**
 * @route POST /api/decorations
 * @description Create a new decoration with image upload
 * @access Private (Admin only)
 * @param {Object} req.body - Request body
 * @param {string} req.body.name - Decoration name
 * @param {string} req.body.description - Decoration description
 * @param {number} req.body.price - Decoration price
 * @param {File} req.file - Decoration image file
 * @returns {Object} 201 - Created decoration object
 * @returns {Object} 400 - Missing required fields
 * @returns {Object} 500 - Server error
 */
router.post('/',upload.single('image'),authMiddleware,async (req,res)=>{
    try{
        const{name,description,price} = req.body;
        if(!name || !description || !req.file || !price ){
            return res.status(400).json({message:"please Fill all fields"});
        }
        const result = await uploadToCloudinary(req.file.buffer);
        const newDecoration = new Decoration({
            name,
            description,
            price,
            image:result.secure_url,
            imageId : result.public_id
        });
        await newDecoration.save();
        return res.status(201).json({message:"Decorations Created Successfully", decoration:newDecoration});

    }catch(err){
        console.error(`Error creating decoration:`, err);
        return res.status(500).json({message:"Internal server error"});
    }
});

/**
 * @route GET /api/decorations
 * @description Get all decorations
 * @access Public
 * @returns {Object} 200 - Array of all decorations
 * @returns {Object} 500 - Server error
 */
router.get('/',async(req,res)=>{
    try{
        const decorations = await Decoration.find();
        return res.status(200).json({message:"Decorations fetched Successfully",decorations});
    }catch(err){
        console.error("Error fetching decorations:",err);
        return res.status(500).json({message:"internal server error"});
    }
});

/**
 * @route GET /api/decorations/:id
 * @description Get a specific decoration by ID
 * @access Public
 * @param {string} req.params.id - Decoration ID
 * @returns {Object} 200 - Decoration object
 * @returns {Object} 404 - Decoration not found
 * @returns {Object} 500 - Server error
 */
router.get('/:id',async(req,res)=>{
    try{
        const decoration = await Decoration.findById(req.params.id);
        if(!decoration){
            return res.status(404).json({message:"Decoration not found"});
        }
        return res.status(200).json({message:"Decoaration Fetched Successfully",decoration});

    }catch(err){
        console.error("Error fetching decoration:",err);
        return res.status(500).json({message:"Internal Server Error"});
    }
});

/**
 * @route PATCH /api/decorations/:id
 * @description Update a decoration by ID, including optional image update
 * @access Private (Admin only)
 * @param {string} req.params.id - Decoration ID
 * @param {Object} req.body - Request body
 * @param {string} [req.body.name] - Updated decoration name
 * @param {string} [req.body.description] - Updated decoration description
 * @param {number} [req.body.price] - Updated decoration price
 * @param {File} [req.file] - Updated decoration image file
 * @returns {Object} 200 - Updated decoration object
 * @returns {Object} 404 - Decoration not found
 * @returns {Object} 500 - Server error
 */
router.patch('/:id', upload.single('image'),authMiddleware, async (req, res) => {
    const { name, description, price } = req.body;

    try {

        const decoration = await Decoration.findById(req.params.id);

        if (!decoration) {
            return res.status(404).json({ message: "Decoration not found" });
        }


        if (decoration.imageId) {
            await deleteFromCloudinary(decoration.imageId);
        }


        let imageUrl = decoration.image;
        let imageId = decoration.imageId;

        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer);
            imageUrl = result.secure_url;
            imageId = result.public_id;
        }

        const updatedDecoration = await Decoration.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    name,
                    description,
                    price,
                    image: imageUrl,
                    imageId: imageId,
                },
            },
            { new: true }
        );

        res.status(200).json({
            message: "Decoration updated successfully",
            decoration: updatedDecoration,
        });

    } catch (err) {
        console.error("Error updating decoration:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

/**
 * @route DELETE /api/decorations/:id
 * @description Delete a decoration by ID, including associated image
 * @access Private (Admin only)
 * @param {string} req.params.id - Decoration ID
 * @returns {Object} 200 - Success message
 * @returns {Object} 404 - Decoration not found
 * @returns {Object} 500 - Server error
 */
router.delete('/:id',authMiddleware, async (req, res) => {
    try {

        const decoration = await Decoration.findById(req.params.id);

        if (!decoration) {
            return res.status(404).json({ message: "Decoration not found" });
        }


        if (decoration.imageId) {
            await deleteFromCloudinary(decoration.imageId);
        }


        await Decoration.findByIdAndDelete(req.params.id);

        return res.status(200).json({ message: "Decoration deleted successfully" });

    } catch (err) {
        console.error("Error deleting decoration:", err);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

module.exports = router;
