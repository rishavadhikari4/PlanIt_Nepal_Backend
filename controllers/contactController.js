const express = require("express");
const Contact = require("../models/Contact");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();


//this is to post into the contact collection
router.post("/", async(req,res)=>{
    try{
        const {name,email,phone,budget,message} = req.body;
        if(!name || !email || !phone || !budget){
            return res.status(400).json({message:"Please Fill all fields"});
        }
        const newContact = new Contact({
            name,
            email,
            phone,
            budget,
            message
        });
        await newContact.save();
        return res.status(201).json({message:"Contact Created Successfully"});

    }catch(err){
        console.error(`Error creating contact:`, err);
        return res.status(500).json({message:"Internal server error"});
    }
});

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