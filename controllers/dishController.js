const express = require('express');
const dishCategory = require('../models/Dishes');

const router = express.Router();

//this is the api to add dishes to a particular category
router.post('/', async (req, res) => {
  try {
    const { category, dishes } = req.body;

    if (!category || !dishes || !Array.isArray(dishes)) {
      return res.status(400).json({ message: "Please provide category and dishes (as an array)" });
    }

    const updatedCategory = await dishCategory.findOneAndUpdate(
      { category },
      { $push: { dishes: { $each: dishes } } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: "Dishes added/updated successfully",
      updatedCategory
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

//this is to get a particular category dishes
router.get('/:category',async(req,res)=>{
    try{
        const {category} = req.params;

        const foundCategory = await dishCategory.findOne({category});
        if(!foundCategory){
            return res.status(404).json({message:"Categrory not found"});
        }
        res.status(200).json({
            message:`Dishes Found for the category: ${category}`,
            dishes:foundCategory.dishes
        });

    }catch(err){
        console.error(err);
        res.status(500).json({message:"Internal server error"});
    }
});

//this is to get all the categories
router.get('/',async(req,res)=>{
    try{
        const categories = await dishCategory.find();
        if(!categories){
            return res.status(404).json({message:"No categories found"});
        }
        res.status(200).json({
            message:"Categories fetched successfully",
            categories
        });
    }catch(err){
        console.error(err);
        res.status(500).json({message:"Internal server error"});
    }}
);


router.patch('/category/:categoryId/dish/:dishId',async(req,res)=>{
    try{
        const {categoryId,dishId} = req.params;
        const {name,description,image} = req.body;
        if(!name || !description || !image){
            return res.status(400).json({message:"Please provide name, description and image"});
        }
        const updateFields = {};
        if(name) updateFields['dishes.$.name'] = name;
        if(description) updateFields['dishes.$.description'] = description;
        if(image) updateFields['dishes.$.image'] = image;


        const updatedCategory = await dishCategory.findOneAndUpdate(
            {_id:categoryId,"dishes._id":dishId},
            {$set:updateFields},
            {new:true}
        );

        if(!updatedCategory){
            return res.status(404).json({message:"Category or dish not found"});
        }
        res.status(200).json({
            message:"Dish updated successfully",
            updatedCategory
        });

    }catch(err){
        console.error(err);
        res.status(500).json({message:"Internal server error"});
    }
});

//this api to delete a dish from a category
router.delete('/category/:categoryId/dish/:dishId',async(req,res)=>{
    try{
        const{categoryId,dishId} = req.params;

        const deletedCategory = await dishCategory.findByIdAndUpdate(
      categoryId,
      { $pull: { dishes: { _id: dishId } } },
      { new: true }
    );
        if(!deletedCategory){
            return res.status(404).json({message:"Category or dish not found"});
        }
        res.status(200).json({
            message:"Dish deleted successfully",
            deletedCategory
        });
    }catch(err){
        console.error(err);
        res.status(500).json({message:"Internal server error"});
    }
});



module.exports = router;
