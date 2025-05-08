const express = require('express');
const Decoration = require('../models/Decoration');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

//this is to post into the API

router.post('/',async (req,res)=>{
    try{
        const{name,description,image} = req.body;
        if(!name || !description ||!image){
            return res.status(400).json({message:"please Fill all fields"});
        }
        const newDecoration = new Decoration({
            name,
            description,
            image
        });
        await newDecoration.save();
        return res.status(201).json({message:"Decorations Created Successfully", decoration:newDecoration});

    }catch(err){
        console.error(`Error creating decoration:`, err);
        return res.status(500).json({message:"Internal server error"});
    }
});

//this is to get all the decorations

router.get('/',async(req,res)=>{
    try{
        const decorations = await Decoration.find();
        return res.status(200).json({message:"Decorations fetched Successfully",decorations});
    }catch(err){
        console.error("Error fetching decorations:",err);
        return res.status(500).json({message:"internal server error"});
    }
});

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

router.patch('/:id', async(req,res)=>{
    try{
        const {name,description,image} = req.body;
        const updatedDecoration = await Decoration.findByIdAndUpdate(req.params.id,{
            $set:{
                name,
                description,
                image
            }
        },{new:true});
        if(!updatedDecoration){
            return res.status(404).json({message: "Decoration not found"});
        }
        return res.status(200).json({message:"Decoration updated successfully",decoration:updatedDecoration});
    }catch(err){
        console.error("Error updating decoration:",err);
        return res.status(500).json({message:"Internal Server Error"});
    }

});

router.delete('/:id',async(req,res)=>{
    try{
        const deletedDecoration = await Decoration.findByIdAndDelete(req.params.id);
        if(!deletedDecoration){
            return res.status(404).json({message:"Decoration Not Found"});
        }
        return res.status(200).json({message:"Decoration Deleted Successfully"});
    }catch(err){
        console.error("Error deleting decoration:", err);
        return res.status(500).json({message:"Internal Server Error"});
    }
});

module.exports = router;
