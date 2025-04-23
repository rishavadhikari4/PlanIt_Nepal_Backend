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
    image:{
        type:String,
        required:true
    }
},{timestamps:true});

const Decoration = mongoose.model('Decoration',decorationSchema);

module.exports = Decoration;