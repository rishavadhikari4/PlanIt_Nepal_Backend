const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const { contactFormLimiter } = require('../utils/rateLimitters');
const contactController = require("../controllers/contactController");

const router = express.Router();

// PUBLIC ROUTES (No authentication required)
router.post('/form', contactFormLimiter, contactController.postForm);

// ADMIN ROUTES (Authentication + Admin role required)
router.get('/form', authMiddleware, authorizeRoles("admin"), contactController.getContacts);

module.exports = router;
