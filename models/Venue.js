const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema({
  image: {
    type:String,
    default:null
  },
  imageId:{
    type:String,
    default:null
  }
})

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
  capacity:{
    type:String,
    required:true,
  },
  price: {
    type: Number,
    required: true
  },
  photos:[imageSchema],
  venueImage: {
    type: String,
    required: true,
  },
  venueImageId: {
    type: String
  }
}, {timestamps: true});

const Venue = mongoose.model("Venue", venueSchema);

module.exports = Venue;