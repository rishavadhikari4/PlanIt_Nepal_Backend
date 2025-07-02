const mongoose = require("mongoose");

const venueSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,},
  location: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  price:{
    type: Number,
    required:true
  },
  image: {
    type: String,
    required: true,
  },
  imageId:{
    type: String
  }
},{timestamps: true});

  const Venue = mongoose.model("Venue", venueSchema);
    
  module.exports = Venue;