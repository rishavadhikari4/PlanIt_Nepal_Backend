const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema({
    image: {
        type: String,
        default: null
    },
    imageId: {
        type: String,
        default: null
    }
});

const studioSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
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
    services: [{
        type: String,
        enum: ['Wedding Photography', 'Pre-wedding Shoot', 'Video Recording', 'Album Design', 'Digital Copies', 'Drone Photography']
    }],
    photos: [imageSchema],
    studioImage:{
        type:String,
        default:null,
    },
    studioImageId:{
        type:String,
        default:null,
    },
}, { timestamps: true });

const Studio = mongoose.model("Studio", studioSchema);

module.exports = Studio;