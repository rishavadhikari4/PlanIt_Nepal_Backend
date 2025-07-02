const mongoose = require('mongoose');

const decorationSchema = new mongoose.Schema({
    name:{
        type: String,
        required: true
    },
    description:{
        type: String,
        required: true
    },
    price:{
        type: Number,
        required:true,
    },
    image:{
        type:String,
        required:true
    },
    imageId:{
        type:String,
    }
},{timestamps:true});

const Decoration = mongoose.model('Decoration',decorationSchema);

module.exports = Decoration;