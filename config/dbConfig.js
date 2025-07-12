/**
 * @module config/dbConfig
 * @description MongoDB database connection configuration
 * @requires mongoose
 * @requires dotenv
 */
const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Establishes a connection to MongoDB using the URI from environment variables
 * 
 * @function connectDB
 * @async
 * @returns {Promise<void>} A promise that resolves when the connection is successful
 * @throws {Error} If the connection fails, logs the error and exits the process
 * @requires MONGO_URI - MongoDB connection string defined in environment variables
 * 
 * @example
 * // In your server.js or app.js file
 * const connectDB = require('./config/dbConfig');
 * 
 * // Connect to MongoDB at application startup
 * connectDB()
 *   .then(() => console.log('Database ready for operations'))
 *   .catch(err => console.error('Failed to initialize database:', err));
 */
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error(err);
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};

module.exports = connectDB;