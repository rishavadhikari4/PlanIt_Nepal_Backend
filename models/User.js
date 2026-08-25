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
    number: {
        type: Number,
        unique: true,
        sparse: true, // This allows multiple null values
        default: undefined // Use undefined instead of null
    },
    password: {
        type: String,
    },
    role: {
        type: String,
        required: true
    },
    verified:{
        type:Boolean,
        default:false
    },
    OTP:{
        type:String,
        default:null
    },
    OTPexpiry:{
        type:Date,
        default:null
    },
    refreshToken: {
        type: String,
        default: null
    },
    profileImage: {
        type: String,
        default: "https://res.cloudinary.com/de1lvlqme/image/upload/v1749566197/vecteezy_default-profile-account-unknown-icon-black-silhouette_20765399_ldtak0.jpg"
    },
    profileImageId: {
        type: String,
        default: null
    },
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpire: {
        type: Date,
        default: null
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    },
    /* The shortlist behind the heart on every listing. Stored as a typed
       reference rather than three arrays, so one query returns the lot and a
       new bookable type costs nothing. */
    favorites: [{
        itemType: {
            type: String,
            enum: ['venue', 'studio', 'dish'],
            required: true
        },
        itemId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, { timestamps: true });

/* email and number are declared unique on the fields themselves; `number` is
   sparse so the accounts that never supply one (Google sign-ups) do not all
   collide on null. These cover the lookups that happen on every auth request. */
userSchema.index({ role: 1 });
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });
userSchema.index({ refreshToken: 1 }, { sparse: true });
/* "Is this one shortlisted?" runs on every listing card the user sees. */
userSchema.index({ "favorites.itemId": 1, "favorites.itemType": 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;

