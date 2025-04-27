const express = require("express");
const passport = require("passport");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();


const User = require("../models/User");
const authMiddleware = require("../middleware/middleware");

const router = express.Router();


router.post('/register',async(req , res)=>{
    const {name, email, password, confirmPassword} = req.body;
    if(password !== confirmPassword){
        return res.status(400).json({message:"Passwords do not match"});
    }
    if(!password || typeof password !== 'string' || password.trim() === ''){
        return res.status(400).json({message:"Password is required and must be a valid string"});
    }
    try{
        const userExist = await User.findOne({email});
        if(userExist){
            return res.status(400).json({message:"User already exists"});
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = new User({name,email,password:hashedPassword});
        await newUser.save();

        const token = jwt.sign({
            id:newUser._id,
            name:newUser.name,
            email:newUser.email
        },process.env.JWT_SECRET || "your_secret_key",
        {expiresIn:"2h"}
    );
    res.json({token});
    }catch(err){
        console.error(err);
        res.status(500).json({message:"Server error"});
    }
});

router.post('/login',async(req,res)=>{
     const { email, password } = req.body;
    try {
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user._id ,
              email: user.email,
              name: user.name
            },
            process.env.JWT_SECRET || 'your_secret_key',
            { expiresIn: '2h' }
        );

        res.json({token});
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


router.post('/adminLogin', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Special admin login
        if (email === 'admin@admin.com' && password === 'admin') {
            const token = jwt.sign(
                { email: 'admin@admin.com' },
                process.env.JWT_SECRET || 'your_secret_key',
                { expiresIn: '2h' }
            );

            return res.json({ token });
        }

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // If not admin, respond with invalid credentials
        return res.status(400).json({ message: 'Invalid credentials' });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/verify', authMiddleware, (req, res) => {
    res.json({ valid: true, user: req.user });
});




router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get("/google/callback", passport.authenticate("google", { session: false }), (req, res) => {
  const user = req.user;


  const token = jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    process.env.JWT_SECRET || "your_secret_key",
    { expiresIn: "2h" }
  );

  res.redirect(`http://localhost:8080/auth-success?token=${token}`);
});




router.get(`/profile`,authMiddleware,async(req,res)=>{
    try{
        const user = await User.findById(req.user.id).select(`-password`);
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

router.patch('/profile', authMiddleware, async (req, res) => {
    try {
        const { name, email } = req.body;
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

        if (name) user.name = name;

        await user.save();
        res.json({ message: 'Profile updated successfully', user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('allUsers', authMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;