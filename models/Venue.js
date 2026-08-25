const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema({
  image: {
    type: String,
    default: null,
  },
  imageId: {
    type: String,
    default: null,
  },
});

const venueRatingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  ratedAt: {
    type: Date,
    default: Date.now,
  },
});

const venueSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0,
  },
  location: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  capacity: {
    type: String,
    required: true,
  },
  orderedCount: {
    type: Number,
    default: 0,
  },
  price: {
    type: Number,
    required: true,
  },
  photos: [imageSchema],
  venueImage: {
    type: String,
    required: true,
  },
  venueImageId: {
    type: String,
  },
  ratings: [venueRatingSchema],
  totalRatings: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

/* Indexes follow the catalogue's real access patterns: the listing sorts by
   createdAt, price, name or capacity and filters on a price range, and the
   search box runs a text query across name, location and description. */
venueSchema.index({ createdAt: -1 });
venueSchema.index({ price: 1 });
venueSchema.index({ name: 1 });
venueSchema.index({ orderedCount: -1 });
venueSchema.index(
  { name: "text", location: "text", description: "text" },
  { name: "venue_text", weights: { name: 10, location: 5, description: 1 } },
);

const Venue = mongoose.model("Venue", venueSchema);

module.exports = Venue;