const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
    },
    profieImage:{
        type:String,
    },
    resetPasswordToken:{
        type:String,
        default:null
    },
    resetPasswordExpire:{
        type:Date,
        default:null
    }
}, { 
    timestamps: true 
});

// Middleware to handle profieImage default logic
userSchema.pre('save', function(next) {
    if (!this.profieImage || this.profieImage.trim() === '') {
        this.profieImage = "https://res.cloudinary.com/de1lvlqme/image/upload/v1749566197/vecteezy_default-profile-account-unknown-icon-black-silhouette_20765399_ldtak0.jpg";
    }
    next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;

