const express = require('express');
const dishCategory = require('../models/Dishes');
const upload = require('../middleware/multer');
const {deleteFromCloudinary,uploadToCloudinary} = require('../config/cloudinaryConfig');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();


//this is the api to add dishes to a particular category

router.post('/upload-dish', upload.single('image'),authMiddleware, async (req, res) => {
  try {
    const { category, name, price, description } = req.body;

    if (!category || !name || !price || !description || !req.file) {
      return res.status(400).json({ message: 'Please provide category, dish name, and image' });
    }

    // Upload image to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer);

    const newDish = {
      name,
      price,
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

// GET /api/dishes/dish/:dishId
router.get('/dish/:dishId', async (req, res) => {
  try {
    const { dishId } = req.params;

    // Find the category that contains the dish with this dishId
    const category = await dishCategory.findOne({ 'dishes._id': dishId });

    if (!category) {
      return res.status(404).json({ message: "Dish not found" });
    }

    // Find the dish inside dishes array
    const dish = category.dishes.id(dishId);

    if (!dish) {
      return res.status(404).json({ message: "Dish not found in the category" });
    }

    // Return dish data and categoryId (category._id)
    res.status(200).json({
      message: "Dish found successfully",
      dish,
      categoryId: category._id,
      categoryName: category.category // optional, if you want to send category name also
    });

  } catch (err) {
    console.error("Error fetching dish by ID:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
//delete a whole category
router.delete('/category/:categoryId', authMiddleware,async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Find the category to delete
    const category = await dishCategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Delete all images of dishes from Cloudinary before deleting the category
    for (const dish of category.dishes) {
      if (dish.imageId) {
        await deleteFromCloudinary(dish.imageId);
      }
    }

    // Delete the category document
    await dishCategory.findByIdAndDelete(categoryId);

    res.status(200).json({ message: "Category and all its dishes deleted successfully" });

  } catch (err) {
    console.error("Error deleting category:", err);
    res.status(500).json({ message: "Internal Server Error" });
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


//edit the dish
router.patch('/category/:categoryId/dish/:dishId',authMiddleware, upload.single('image'), async (req, res) => {
    try {
        const { categoryId, dishId } = req.params;
        const { name , price , description } = req.body;


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
        if (price) dish.price = price;
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
router.delete('/category/:categoryId/dish/:dishId',authMiddleware, async (req, res) => {
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
