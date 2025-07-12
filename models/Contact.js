/**
 * @module models/Contact
 * @description MongoDB schema model for contact form submissions
 * @requires mongoose
 */
const mongoose = require("mongoose");

/**
 * Contact form submission schema definition
 * 
 * @typedef {Object} ContactSchema
 * @property {string} name - Name of the person submitting the contact form
 * @property {string} email - Email address for correspondence
 * @property {string} phone - Phone number for contact
 * @property {number} price - Budget/price information provided by the user
 * @property {string} [message] - Optional message or additional details from the user
 * @property {Date} createdAt - Automatically generated timestamp when record is created
 * @property {Date} updatedAt - Automatically generated timestamp when record is updated
 */
const contactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
    },
    message: {
        type: String
    }
}, {timestamps: true});

/**
 * Contact model compiled from the schema
 * @type {Model}
 */
const Contact = mongoose.model("Contact", contactSchema);

module.exports = Contact;
