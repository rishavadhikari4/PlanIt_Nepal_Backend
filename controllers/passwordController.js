/**
 * @module controllers/passwordController
 * @description Handles all password-related operations including password changes and resets
 * @requires bcryptjs
 * @requires express
 * @requires ../models/User
 * @requires ../middleware/authMiddleware
 * @requires nodemailer
 * @requires googleapis
 * @requires express-rate-limit
 * @requires crypto
 * @requires dotenv
 */
const bcrypt = require(`bcryptjs`);
const express = require(`express`);
const User = require(`../models/User`);
const authMiddleware = require(`../middleware/authMiddleware`);
const nodemailer = require(`nodemailer`);
const {google} = require(`googleapis`);
const rateLimit = require(`express-rate-limit`);
const crypto = require(`crypto`);
require(`dotenv`).config();

const router = express.Router();

/**
 * Rate limiter for password reset requests
 * Limits to 5 requests per 15 minutes from the same IP
 */
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: {
        message: "Too many password reset requests from this IP, please try again later"
    },
    standardHeaders: true, 
    legacyHeaders: false   
});

/**
 * Google OAuth2 client configuration for sending emails
 */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID; 
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET; 
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Set the refresh token
oAuth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

/**
 * @route PATCH /api/password/changepassword
 * @description Change password for authenticated user
 * @access Private
 * @param {Object} req.body - Request body
 * @param {string} req.body.currentPassword - User's current password
 * @param {string} req.body.newPassword - New password
 * @param {string} req.body.confirmNewPassword - Confirmation of new password
 * @returns {Object} 200 - Success message
 * @returns {Object} 400 - Validation error or incorrect current password
 * @returns {Object} 404 - User not found
 * @returns {Object} 500 - Server error
 */
router.patch(`/changepassword`, authMiddleware, async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: "New passwords do not match" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password should be at least 6 characters long" });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server Error" });
    }
});

/**
 * @route POST /api/password/forgotpassword
 * @description Send password reset email with reset link
 * @access Public
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User's email address
 * @returns {Object} 200 - Email sent message
 * @returns {Object} 404 - User not found
 * @returns {Object} 429 - Rate limit exceeded
 * @returns {Object} 500 - Server error
 */
router.post('/forgotpassword', forgotPasswordLimiter, async (req, res) => {
    const { email } = req.body;
    try {
        const accessTokenObj = await oAuth2Client.getAccessToken();
        const accessToken = accessTokenObj?.token;
        const transporter = nodemailer.createTransport({
            service: `gmail`,
            auth: {
              type: 'OAuth2',
              user: process.env.USER_EMAIL,
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
              accessToken: accessToken
            }

        });
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordToken = hashedToken;

        user.resetPasswordExpire = Date.now() + 3600000;
        //this expires in the one hour

        await user.save();

        const mailOptions = {
            from:process.env.USER_EMAIL,
            to:email,
            subject:`Reset Password`,
            text:`Click on the link to reset the password:${resetLink}`
        };

        await transporter.sendMail(mailOptions);
        return res.status(200).json({message:`Email sent successfully`});
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: `Server Error` });
    }
});

/**
 * @route POST /api/password/resetpassword/:token
 * @description Reset password using the token from email
 * @access Public
 * @param {string} req.params.token - Reset password token from email
 * @param {Object} req.body - Request body
 * @param {string} req.body.newPassword - New password
 * @param {string} req.body.confirmNewPassword - Confirmation of new password
 * @returns {Object} 200 - Password reset success message
 * @returns {Object} 400 - Invalid/expired token or validation error
 * @returns {Object} 500 - Server error
 */
router.post('/resetpassword/:token', async (req, res) => {
    const { token } = req.params;
    const { newPassword, confirmNewPassword } = req.body;

    if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: "New passwords do not match" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password should be at least 6 characters long" });
    }

    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired token" });
        }

        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(newPassword, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;

        await user.save();

        return res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;