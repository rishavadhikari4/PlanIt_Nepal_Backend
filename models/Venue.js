/**
 * @module models/Venue
 * @description MongoDB schema model for wedding venues
 * @requires mongoose
 */
const mongoose = require("mongoose");

/**
 * Venue schema definition
 * 
 * @typedef {Object} VenueSchema
 * @property {string} name - Name of the venue
 * @property {string} location - Physical location/address of the venue
 * @property {string} description - Detailed description of the venue
 * @property {number} price - Rental price of the venue
 * @property {string} image - URL to the venue's image
 * @property {string} [imageId] - Optional ID reference for the image in cloud storage
 * @property {Date} createdAt - Automatically generated timestamp when record is created
 * @property {Date} updatedAt - Automatically generated timestamp when record is updated
 */
const venueSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true
  },
  image: {
    type: String,
    required: true,
  },
  imageId: {
    type: String
  }
}, {timestamps: true});

/**
 * Venue model compiled from the schema
 * @type {Model}
 */
const Venue = mongoose.model("Venue", venueSchema);

module.exports = Venue;