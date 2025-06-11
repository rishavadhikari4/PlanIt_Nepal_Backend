const mongoose = require ('mongoose');

const dishSchema = new mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    description:{
        type:String,
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
        enum:["Starters", "Main Course", "Desserts","Drinks"],
        required:true
    },
    dishes:[dishSchema]
});


const Category = mongoose.model('Category', categorySchema);

module.exports = Category;