/**
 * @module models/Dishes
 * @description MongoDB schema model for food dishes categorized by type
 * @requires mongoose
 */
const mongoose = require('mongoose');

/**
 * Dish schema definition for individual food items
 * 
 * @typedef {Object} DishSchema
 * @property {string} name - Name of the dish
 * @property {number} price - Price of the dish
 * @property {string} description - Detailed description of the dish
 * @property {string} [image] - Optional URL to the dish's image
 * @property {string} [imageId] - Optional ID reference for the image in cloud storage
 */
const dishSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    image: {
        type: String,
    },
    imageId: {
        type: String,
    }
});

/**
 * Category schema definition to group related dishes
 * 
 * @typedef {Object} CategorySchema
 * @property {string} category - Name of the category (e.g., "Appetizers", "Main Course", "Desserts")
 * @property {Array<DishSchema>} dishes - Array of dish objects belonging to this category
 */
const categorySchema = new mongoose.Schema({
    category: {
        type: String,
        required: true
    },
    dishes: [dishSchema]
});

/**
 * Category model compiled from the schema
 * Contains both category information and the dishes within each category
 * @type {Model}
 */
const Category = mongoose.model('Category', categorySchema);

module.exports = Category;