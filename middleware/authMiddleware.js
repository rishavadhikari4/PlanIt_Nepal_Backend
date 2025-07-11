const jwt = require("jsonwebtoken");

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
