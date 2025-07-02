const mongoose = require ('mongoose');

const dishSchema = new mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    price:{
        type:Number,
        required:true
    },
    description:{
        type:String,
        required:true
    },
    image:{
        type:String,
    },
    imageId:{
        type:String,
    }
});

const categorySchema = new mongoose.Schema({
    category:{
        type:String,
        required:true
    },
    dishes:[dishSchema]
});


const Category = mongoose.model('Category', categorySchema);

module.exports = Category;