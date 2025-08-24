const Cuisine = require('../models/Cuisine');
const {deleteFromCloudinary,uploadToCloudinary} = require('../config/cloudinaryConfig');

exports.uploadDish = async (req, res) => {
  const { name, price, description } = req.body;
  let category = req.params.category;

  try {
    if (!category || !name || !price || !description || !req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please provide category, dish name, and image'
      });
    }

    category = category.toLowerCase();

    const result = await uploadToCloudinary(req.file.buffer);

    const newDish = {
      name,
      price,
      description,
      image: result.secure_url,
      imageId: result.public_id
    };

    const updatedCategory = await Cuisine.findOneAndUpdate(
      { category },
      { $push: { dishes: newDish } },
      { new: true, upsert: true }
    );

    return res.status(201).json({
      success: true,
      message: 'Dish added successfully',
      data: {
        dish: newDish,
        category: updatedCategory
      }
    });

  } catch (error) {
    console.error('Error uploading dish:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

exports.getDishbyId = async (req, res) => {
  const { dishId } = req.params;
  try {
    const cuisine = await Cuisine.findOne({ 'dishes._id': dishId }).lean();

    if (!cuisine) {
      return res.status(404).json({
        success: false,
        message: "Dish not found"
      });
    }
    
    const dish = cuisine.dishes.find(d => d._id.toString() === dishId);

    if (!dish) {
      return res.status(404).json({
        success: false,
        message: "Dish not found in the cuisine category"
      });
    }

    res.status(200).json({
      success: true,
      message: "Dish found successfully",
      data: {
        dish,
        cuisineId: cuisine._id,
        cuisineCategory: cuisine.category
      }
    });

  } catch (error) {
    console.error("Error fetching dish by ID:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

exports.getDishesForACategory = async (req, res) => {
  let { category } = req.params;
  try {
    category = category.toLowerCase();

    const foundCategory = await Cuisine.findOne({ category }).lean();

    if (!foundCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    res.status(200).json({
      success: true,
      message: `Dishes found for the category: ${category}`,
      data: {
        category: foundCategory.category,
        dishes: foundCategory.dishes,
        totalDishes: foundCategory.dishes.length
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

exports.getAllCuisines = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const sortField = req.query.sortField || 'name';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    const cuisines = await Cuisine.find().lean();

    if (cuisines.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No categories found",
        data: {
          cuisines: [],
          pagination: {
            totalDishes: 0,
            currentPage: page,
            totalPages: 0,
            limit
          }
        }
      });
    }

    const processedCuisines = cuisines.map(cuisine => {
      let dishes = [...cuisine.dishes];

      if (req.query.minPrice || req.query.maxPrice) {
        dishes = dishes.filter(dish => {
          if (req.query.minPrice && dish.price < parseFloat(req.query.minPrice)) return false;
          if (req.query.maxPrice && dish.price > parseFloat(req.query.maxPrice)) return false;
          return true;
        });
      }

      if (req.query.dishName) {
        dishes = dishes.filter(dish => 
          dish.name.toLowerCase().includes(req.query.dishName.toLowerCase())
        );
      }

      dishes.sort((a, b) => {
        if (sortField === 'price') {
          return sortOrder === 1 ? a.price - b.price : b.price - a.price;
        } else if (sortField === 'name') {
          return sortOrder === 1 ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
        return 0;
      });

      const totalDishes = dishes.length;
      const paginatedDishes = dishes.slice(skip, skip + limit);

      return {
        ...cuisine,
        dishes: paginatedDishes,
        dishesMetadata: {
          totalDishes,
          currentPage: page,
          totalPages: Math.ceil(totalDishes / limit),
          limit,
          hasNextPage: page < Math.ceil(totalDishes / limit),
          hasPrevPage: page > 1
        }
      };
    });

    const totalDishesAcrossAllCuisines = cuisines.reduce((total, cuisine) => {
      let dishes = [...cuisine.dishes];

      if (req.query.minPrice || req.query.maxPrice) {
        dishes = dishes.filter(dish => {
          if (req.query.minPrice && dish.price < parseFloat(req.query.minPrice)) return false;
          if (req.query.maxPrice && dish.price > parseFloat(req.query.maxPrice)) return false;
          return true;
        });
      }
      
      if (req.query.dishName) {
        dishes = dishes.filter(dish => 
          dish.name.toLowerCase().includes(req.query.dishName.toLowerCase())
        );
      }
      
      return total + dishes.length;
    }, 0);

    res.status(200).json({
      success: true,
      message: "Categories fetched successfully",
      data: {
        cuisines: processedCuisines,
        overallPagination: {
          totalDishesAcrossAllCuisines,
          currentPage: page,
          totalPages: Math.ceil(totalDishesAcrossAllCuisines / limit),
          limit,
          hasNextPage: page < Math.ceil(totalDishesAcrossAllCuisines / limit),
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

exports.updateCuisine = async (req,res) => {
  const { categoryId, dishId } = req.params;
  const { name, price, description } = req.body;
  
  try {
    const cuisine = await Cuisine.findById(categoryId);
    if (!cuisine) {
      return res.status(404).json({ 
        success: false,
        message: "Category not found" 
      });
    }

    const dish = cuisine.dishes.id(dishId);
    if (!dish) {
      return res.status(404).json({ 
        success: false,
        message: "Dish not found" 
      });
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

    await cuisine.save();

    res.status(200).json({
      success: true,
      message: "Dish updated successfully",
      data: {
        updatedDish: dish,
        category: cuisine.category
      }
    });

  } catch (err) {
    console.error("Error updating dish:", err);
    res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
}

exports.deleteDish = async (req,res) => {
  const { categoryId, dishId } = req.params;
  try {
    const cuisine = await Cuisine.findById(categoryId);
    if (!cuisine) {
      return res.status(404).json({ 
        success: false,
        message: "Category not found" 
      });
    }

    const dish = cuisine.dishes.id(dishId);
    if (!dish) {
      return res.status(404).json({ 
        success: false,
        message: "Dish not found" 
      });
    }

    if (dish.imageId) {
      await deleteFromCloudinary(dish.imageId);
    }

    dish.deleteOne();
    await cuisine.save();

    res.status(200).json({
      success: true,
      message: "Dish deleted successfully",
      data: {
        deletedDishId: dishId,
        updatedCategory: cuisine
      }
    });
  } catch (error) {
    console.error("Error deleting dish:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
}

exports.deleteCategory = async (req,res) => {
  const { categoryId } = req.params;
  try {
    const cuisine = await Cuisine.findById(categoryId);
    if (!cuisine) {
      return res.status(404).json({ 
        success: false,
        message: "Category not found" 
      });
    }

    for (const dish of cuisine.dishes) {
      if (dish.imageId) {
        await deleteFromCloudinary(dish.imageId);
      }
    }

    await Cuisine.findByIdAndDelete(categoryId);

    res.status(200).json({ 
      success: true,
      message: "Category and all its dishes deleted successfully",
      data: {
        deletedCategoryId: categoryId,
        deletedCategory: cuisine.category
      }
    });

  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
}

exports.searchCuisines = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "Please provide a search term"
      });
    }

    const searchTerm = new RegExp(query.trim(), 'i');

    const results = await Cuisine.find({
      $or: [
        { category: searchTerm },
        { 'dishes.name': searchTerm }
      ]
    }).lean();

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No results found for "${query}"`,
        data: {
          results: [],
          searchQuery: query,
          totalResults: 0
        }
      });
    }

    res.status(200).json({
      success: true,
      message: `Found ${results.length} results for "${query}"`,
      data: {
        results,
        searchQuery: query,
        totalResults: results.length
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};





