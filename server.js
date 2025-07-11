/**
 * @module server
 * @description Main server entry point that configures Express application
 * @requires express
 * @requires dotenv
 * @requires passport
 * @requires cors
 * @requires cookie-parser
 * @requires ./controllers/venueController
 * @requires ./controllers/decorationController
 * @requires ./controllers/dishController
 * @requires ./controllers/contactController
 * @requires ./controllers/authController
 * @requires ./controllers/cartController
 * @requires ./controllers/orderController
 * @requires ./controllers/passwordController
 * @requires ./controllers/reviewController
 * @requires ./config/dbConfig
 * @requires ./config/passportConfig
 */
const express = require("express");
const dotenv = require("dotenv");
const passport = require("passport");
const cors = require("cors");
const cookieParser = require('cookie-parser');

/**
 * Import route controllers
 */
const venueController = require("./controllers/venueController");
const decorationController = require("./controllers/decorationController");
const dishController = require("./controllers/dishController");
const contactController = require("./controllers/contactController");
const authController = require("./controllers/authController");
const cartController = require("./controllers/cartController");
const orderController = require("./controllers/orderController");
const passwordController = require("./controllers/passwordController");
const reviewController = require("./controllers/reviewController");

/**
 * Import database connection and passport configuration
 */
const connectDB = require('./config/dbConfig');
require('./config/passportConfig');
dotenv.config();

/**
 * Initialize Express application and configure middleware
 */
const app = express();
app.use(express.json());
app.use(cors(
    {
        origin:process.env.FRONTEND_URL,
        credentials:true
    }
));
app.use(cookieParser());
app.use(passport.initialize());
app.set("trust proxy", 1);

/**
 * Connect to MongoDB database
 */
connectDB();

/**
 * Configure API routes
 */
app.use('/api/venues',venueController);
app.use('/api/decorations',decorationController);
app.use('/api/dishes',dishController);
app.use('/api/contacts',contactController);
app.use('/api/auth',authController);
app.use('/api/cart',cartController);
app.use('/api/orders',orderController);
app.use('/api/password',passwordController);
app.use('/api/review',reviewController);

/**
 * Start server on specified port
 */
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Accessible on your network at http://192.168.1.73:' + PORT);
});

