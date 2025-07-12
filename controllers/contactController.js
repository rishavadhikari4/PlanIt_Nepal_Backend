/**
 * @module controllers/contactController
 * @description Controller for managing contact form submissions
 * @requires express
 * @requires ../models/Contact
 * @requires ../middleware/authMiddleware
 */
const express = require("express");
const Contact = require("../models/Contact");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @route POST /api/contact
 * @description Create a new contact form submission
 * @access Public
 * @param {Object} req.body - Request body
 * @param {string} req.body.name - Contact name
 * @param {string} req.body.email - Contact email
 * @param {string} req.body.phone - Contact phone number
 * @param {number} req.body.price - Budget/price information
 * @param {string} [req.body.message] - Optional message from contact
 * @returns {Object} 201 - Success message
 * @returns {Object} 400 - Missing required fields
 * @returns {Object} 500 - Server error
 */
router.post("/", async(req,res)=>{
    try{
        const {name,email,phone,price,message} = req.body;
        if(!name || !email || !phone || !price){
            return res.status(400).json({message:"Please Fill all fields"});
        }
        const newContact = new Contact({
            name,
            email,
            phone,
            price,
            message
        });
        await newContact.save();
        return res.status(201).json({message:"Contact Created Successfully"});

    }catch(err){
        console.error(`Error creating contact:`, err);
        return res.status(500).json({message:"Internal server error"});
    }
});

/**
 * @route GET /api/contact
 * @description Get all contact form submissions
 * @access Private - Requires authentication
 * @returns {Object} 200 - Success message and array of contacts
 * @returns {Object} 401 - Unauthorized (handled by middleware)
 * @returns {Object} 500 - Server error
 */
router.get("/",authMiddleware,async(req,res)=>{
    try{
        const contacts = await Contact.find();
        return res.status(200).json({message:"Contacts fetched Successfully",contacts});

    }catch(err){
        console.error("Error fetching contacts:",err);
        return res.status(500).json({message:"Internal server error"});
    }
});

module.exports = router;