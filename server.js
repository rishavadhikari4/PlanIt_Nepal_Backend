const express = require("express");
const dotenv = require("dotenv");
const passport = require("passport");
const cors = require("cors");

const venueController = require("./controllers/venueController");
const decorationController = require("./controllers/decorationController");
const dishController = require("./controllers/dishController");
const contactController = require("./controllers/contactController");
const authController = require("./controllers/authController");
const cartController = require("./controllers/cartController");
const orderController = require("./controllers/orderController");
const passwordController = require("./controllers/passwordController");
const reviewController = require("./controllers/reviewController");

const connectDB = require('./config/db');
require('./config/passport');
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(passport.initialize());


connectDB();

app.use('/api/venues',venueController);
app.use('/api/decorations',decorationController);
app.use('/api/dishes',dishController);
app.use('/api/contacts',contactController);
app.use('/api/auth',authController);
app.use('/api/cart',cartController);
app.use('/api/orders',orderController);
app.use('/api/password',passwordController);
app.use('/api/review',reviewController);


const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Accessible on your network at http://192.168.1.73:' + PORT);
});

