/**
 * @module models/Decoration
 * @description MongoDB schema model for wedding decoration options
 * @requires mongoose
 */
const mongoose = require('mongoose');

/**
 * Decoration schema definition
 * 
 * @typedef {Object} DecorationSchema
 * @property {string} name - Name of the decoration package/option
 * @property {string} description - Detailed description of the decoration
 * @property {number} price - Price of the decoration package
 * @property {string} image - URL to the decoration's image
 * @property {string} [imageId] - Optional ID reference for the image in cloud storage
 * @property {Date} createdAt - Automatically generated timestamp when record is created
 * @property {Date} updatedAt - Automatically generated timestamp when record is updated
 */
const decorationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
    },
    image: {
        type: String,
        required: true
    },
    imageId: {
        type: String,
    }
}, {timestamps: true});

/**
 * Decoration model compiled from the schema
 * @type {Model}
 */
const Decoration = mongoose.model('Decoration',decorationSchema);

module.exports = Decoration;