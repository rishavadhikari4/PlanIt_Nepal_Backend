const jwt = require("jsonwebtoken");

//this is the middleware that will be used to authenticate the user
const authMiddleware = (req, res, next) => {
    console.log("Middleware activated!");

    if (!req || !req.headers) {
        console.error("Request object is undefined");
        return res.status(500).json({ message: "Internal Server Error" });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token, authorization denied" });
    }

    const token = authHeader.split(" ")[1];
    console.log("Extracted Token:", token);
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_secret_key");
        console.log("Decoded Token:", decoded);
        req.user = decoded;
        next();
    } catch (error) {
        console.log("Token Verification Error:", error.message);
        return res.status(401).json({ message: "Invalid token" });
    }
};

module.exports = authMiddleware;