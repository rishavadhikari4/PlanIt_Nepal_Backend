/**
 * @module models/User
 * @description MongoDB schema model for user accounts and authentication
 * @requires mongoose
 */
const mongoose = require('mongoose');

/**
 * User schema definition
 * 
 * @typedef {Object} UserSchema
 * @property {string} name - User's full name
 * @property {string} email - User's email address (unique)
 * @property {number} number - User's phone number (unique)
 * @property {string} password - Hashed password for local authentication
 * @property {string} role - User role (e.g., 'customer', 'admin')
 * @property {string} [refreshToken] - JWT refresh token for session management
 * @property {string} [profileImage] - URL to user's profile image (defaults to placeholder)
 * @property {string} [profileImageId] - Cloudinary ID for the profile image
 * @property {string} [resetPasswordToken] - Token for password reset functionality
 * @property {Date} [resetPasswordExpire] - Expiration time for password reset token
 * @property {number} [failedLoginAttempts] - Count of unsuccessful login attempts
 * @property {Date} [lockUntil] - Timestamp until when the account is locked due to failed logins
 * @property {Date} createdAt - Automatically generated timestamp when user is created
 * @property {Date} updatedAt - Automatically generated timestamp when user is updated
 */
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
    },
    password: {
        type: String,
    },
    role: {
        type: String,
        required: true
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
    }
}, { timestamps: true });

/**
 * User model compiled from the schema
 * @type {Model}
 */
const User = mongoose.model('User', userSchema);

module.exports = User;

