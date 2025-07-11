const express = require("express");
const passport = require("passport");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require('express-rate-limit');
require("dotenv").config();

const {uploadToCloudinary,deleteFromCloudinary} = require('../config/cloudinaryConfig');
const upload = require('../middleware/multer');
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { 
  generateAccessToken, 
  generateRefreshToken, 
  setRefreshTokenCookie,
  clearRefreshTokenCookie
} = require('../utils/tokenHelpers');

const {
  registerValidation,
  loginValidation,
  profileUpdateValidation,
  accountDeleteValidation
} = require('../middleware/validators');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5,
  message: 'Too many login attempts, try again later'
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many registration attempts, try again later'
});

const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
if (!accessTokenSecret) {
  throw new Error("Access Token is not defined in environment variables");
}

const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;
if(!refreshTokenSecret){
    throw new Error("Refresh Token is not defined in the environment variable")
}

//this is the route to register new user
router.post('/register', registerLimiter, registerValidation, async (req, res) => {
  const { name, email, number, password } = req.body;
  try {
    // Validation is already done by middleware
    const userExist = await User.findOne({ email });
    if (userExist) {
      return res.status(400).json({ message: "User already exists" });
    }

    const phoneExists = await User.findOne({ number });
    if (phoneExists) {
      return res.status(400).json({ message: "Phone number is already used" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = new User({
      name,
      email,
      number,
      password: hashedPassword,
      role: 'customer'
    });
    await newUser.save();

    res.status(200).json({ message: "Your account is registered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//this is the route for the normal user login
router.post('/login', loginLimiter, loginValidation, async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const timeLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ 
        message: `Account is locked due to too many failed attempts. Try again in ${timeLeft} minutes.` 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Increment failed login attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      
      // Lock account after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60000); // Lock for 15 minutes
        await user.save();
        return res.status(423).json({ message: 'Account locked due to too many failed attempts. Try again in 15 minutes.' });
      }
      
      await user.save();
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    
    // Continue with your existing login logic
    const refreshToken = generateRefreshToken(user);
    const accessToken = generateAccessToken(user);
    
    user.refreshToken = refreshToken;
    await user.save();
    
    setRefreshTokenCookie(res, refreshToken);
    
    res.json({accessToken});

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//this is the route to login the admin
router.post('/adminLogin', loginLimiter, loginValidation, async (req, res) => {
  const { email, password } = req.body;

  // Check if email and password are provided
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // The hashed admin password stored in environment variable
    const hashedAdminPassword = process.env.ADMIN_PASSWORD;

    // Compare the entered password with hashed password
    const isAdminPasswordValid = await bcrypt.compare(password, hashedAdminPassword);

    if (email === process.env.ADMIN_EMAIL && isAdminPasswordValid) {
      // Create JWT accessToken with role info
      const accessToken = generateAccessToken(
        { _id: 'admin' }, 
        { email: process.env.ADMIN_EMAIL, role: 'admin' }
      );

      return res.json({ accessToken });
    }

    // If credentials are invalid
    return res.status(400).json({ message: 'Invalid credentials' });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


//this is to verfiy the user is verifed or not
router.get('/verify', authMiddleware, (req, res) => {
    if (req.user.email === process.env.ADMIN_EMAIL) {
        res.json({ valid: true, user: req.user });
    } else {
        res.json({ valid: false, user: req.user });
    }
});



//this is the route for the Oauth2 verification
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get("/google/callback", passport.authenticate("google", { session: false }), async (req, res) => {
  try {
    const user = req.user;

    const accessToken = jwt.sign(
      { id: user._id, name: user.name, email: user.email },
      accessTokenSecret,
      { expiresIn: "2h" }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      refreshTokenSecret,
      { expiresIn: "7d" }
    );

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Redirect with access token only
    res.redirect(`https://wedding-planner-frontend-delta.vercel.app/auth-success?accessToken=${accessToken}`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


//this is the route to get the particular user profile
router.get(`/profile`,authMiddleware,async(req,res)=>{
    try{
        const user = await User.findById(req.user.id)
        .select(`-password`)
        .select('-refreshToken')
        .select('-resetPasswordToken')
        .select('-resetPasswordExpire');
        if(!user){
            return res.status(404).json({message:`User not found`});
        }
        res.json(user);

    }
    catch(error){
        console.error(error);
        res.status(500).json({message:`Server error`,error});
    }
});

//this is the route to edit the user profile
router.patch('/update-profile', authMiddleware, profileUpdateValidation, async (req, res) => {
    try {
        const { name, email, number } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User Not Found' });
        }

        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email });
            if (emailExists) {
                return res.status(400).json({ message: 'Email already in use by another account' });
            }
            user.email = email;
        }
        if (number && number !== user.number) {
            const numberExists = await User.findOne({ number });
            if (numberExists) {
                return res.status(400).json({ message: 'Number already in use by another account' });
            }
            user.number = number;
        }

        if (name) user.name = name;

        await user.save();
        res.json({ message: 'Profile updated successfully', user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

//this is the route to get all the user detail
router.get('/allUsers', authMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

//this is the route to remove the user from the database
router.delete('/oneAccount/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;

    // 1. Find the user first
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // 2. Delete profile image from Cloudinary if it has a custom one
    if (user.profileImageId) {
        await deleteFromCloudinary(user.profileImageId);
    }

    // 3. Delete user from DB
    await User.findByIdAndDelete(userId);

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting the user:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/ownAccount/:id', authMiddleware, accountDeleteValidation, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.params.id;

    // 1. Find the user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    // 3. Delete profile image from Cloudinary if exists
    if (user.profileImageId) {
      await deleteFromCloudinary(user.profileImageId);
    }

    // 4. Delete user from DB
    await User.findByIdAndDelete(userId);

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting the user:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


router.patch('/update-profile-pic', upload.single('image'), authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User Not found" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Please upload an image" });
        }

        if (user.profileImageId) {
            await deleteFromCloudinary(user.profileImageId); 
        }

        const result = await uploadToCloudinary(req.file.buffer);

        user.profileImage = result.secure_url;
        user.profileImageId = result.public_id;

        await user.save();

        res.status(200).json({ message: "Updated profile picture successfully", image: result.secure_url });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.post('/refresh-token', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token missing' });
    }

    // Verify refresh token
    let payload;
    try {
      payload = jwt.verify(refreshToken, refreshTokenSecret);
    } catch (err) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // Find user and check if refresh token matches
    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: 'Refresh token not valid for user' });
    }

    // Issue new access token
    const accessToken = jwt.sign(
      { id: user._id },
      accessTokenSecret,
      { expiresIn: '2h' }
    );

    res.json({ accessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = undefined;
      await user.save();
    }
    clearRefreshTokenCookie(res);
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

module.exports = router;