const mongoose =  require("mongoose");

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
},{timestamps: true});


const Contact = mongoose.model("Contact", contactSchema);

module.exports = Contact;
