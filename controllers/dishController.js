const express = require('express');
const dishCategory = require('../models/Dishes');
const upload = require('../middleware/multer');
const uploadToCloudinary = require('../config/cloudinaryConfig');

const router = express.Router();


//this is the api to add dishes to a particular category

router.post('/upload-dish', upload.single('image'), async (req, res) => {
  try {
    const { category, name, description } = req.body;

    if (!category || !name || !req.file) {
      return res.status(400).json({ message: 'Please provide category, dish name, and image' });
    }

    // Upload image to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer);

    const newDish = {
      name,
      description,
      image: result.secure_url,
      imageId: result.public_id
    };

    const updatedCategory = await dishCategory.findOneAndUpdate(
      { category },
      { $push: { dishes: newDish } },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      message: 'Dish added successfully with image',
      dish: newDish,
      updatedCategory
    });

  } catch (err) {
    console.error('Error uploading dish:', err);
    return res.status(500).json({ message: 'Internal server error' });
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



router.patch('/category/:categoryId/dish/:dishId', upload.single('image'), async (req, res) => {
    try {
        const { categoryId, dishId } = req.params;
        const { name, description } = req.body;


        const category = await dishCategory.findById(categoryId);
        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        const dish = category.dishes.id(dishId);
        if (!dish) {
            return res.status(404).json({ message: "Dish not found" });
        }


        if (req.file && dish.imageId) {
            await deleteFromCloudinary(dish.imageId);
        }


        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer);
            dish.image = result.secure_url;
            dish.imageId = result.public_id;
        }


        if (name) dish.name = name;
        if (description) dish.description = description;

        await category.save();

        res.status(200).json({
            message: "Dish updated successfully",
            updatedDish: dish,
        });

    } catch (err) {
        console.error("Error updating dish:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});

//this api to delete a dish from a category


router.delete('/category/:categoryId/dish/:dishId', async (req, res) => {
  try {
    const { categoryId, dishId } = req.params;


    const category = await dishCategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }


    const dish = category.dishes.id(dishId);
    if (!dish) {
      return res.status(404).json({ message: "Dish not found" });
    }

    if (dish.imageId) {
      await deleteFromCloudinary(dish.imageId);
    }


    dish.deleteOne();


    await category.save();

    res.status(200).json({
      message: "Dish deleted successfully",
      updatedCategory: category,
    });
  } catch (err) {
    console.error("Error deleting dish:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});






module.exports = router;
