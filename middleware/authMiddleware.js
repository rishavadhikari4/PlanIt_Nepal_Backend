/**
 * @module middleware/authMiddleware
 * @description Authentication middleware that verifies JWT tokens in request headers
 * @requires jsonwebtoken
 */
const jwt = require("jsonwebtoken");

/**
 * Express middleware function that validates JWT authentication tokens
 * 
 * @function authMiddleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() if authentication succeeds, otherwise sends error response
 * @throws {Error} If ACCESS_TOKEN_SECRET is not defined in environment variables
 * 
 * @description
 * This middleware extracts the JWT token from the Authorization header,
 * verifies it using the secret key, and attaches the decoded user data to the request object.
 * 
 * Authentication flow:
 * 1. Checks for valid request object and headers
 * 2. Extracts bearer token from Authorization header
 * 3. Verifies token signature and expiration
 * 4. Adds decoded user info to req.user
 * 
 * Error handling:
 * - 401 Unauthorized: Missing token, expired token, or invalid token
 * - 500 Server Error: Missing request object or secret key
 * 
 * @example
 * // In your routes file:
 * const authMiddleware = require('../middleware/authMiddleware');
 * 
 * // Protect a route with authentication
 * router.get('/protected-route', authMiddleware, (req, res) => {
 *   // If execution reaches here, user is authenticated
 *   // Access user info with req.user
 *   res.json({ message: `Hello ${req.user.id}` });
 * });
 */
const authMiddleware = (req, res, next) => {
    try {
        if (!req || !req.headers) {
            console.error("Request object is undefined");
            return res.status(500).json({ message: "Internal Server Error" });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
            return res.status(401).json({ message: "No token, authorization denied" });
        }

        const accessToken = authHeader.split(" ")[1].trim();
        const secret = process.env.ACCESS_TOKEN_SECRET;
        if (!secret) {
            throw new Error("ACCESS_TOKEN_SECRET not defined");
        }

        const decoded = jwt.verify(accessToken, secret);
        req.user = decoded;
        next();

    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ message: "accessToken expired" });
        } else if (error.name === "JsonWebTokenError") {
            return res.status(401).json({ message: "Invalid accessToken" });
        } else {
            console.error("Authentication error:", error);
            return res.status(500).json({ message: "Server error during authentication" });
        }
    }
};

module.exports = authMiddleware;
