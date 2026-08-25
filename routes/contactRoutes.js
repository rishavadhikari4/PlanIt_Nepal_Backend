const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/authorizeRoles");
const { contactFormLimiter, readLimiter } = require('../utils/rateLimitters');
const contactController = require("../controllers/contactController");

const router = express.Router();

// PUBLIC ROUTES (No authentication required)
router.post('/form', contactFormLimiter, contactController.postContactForm);

// ADMIN ROUTES (Authentication + Admin role required)
router.get('/form', readLimiter,authMiddleware, authorizeRoles("admin"), contactController.getContactForms);

//ADMIN ROUTES (Authentication + Admin role required)
router.get('/form/:contactId',readLimiter,authMiddleware,authorizeRoles("admin"),contactController.getContactFormById);

// Move an enquiry through the queue, or leave a staff-only note.
router.patch('/form/:contactId', authMiddleware, authorizeRoles("admin"), contactController.updateContactStatus);

// Reply by email, and record what was said.
router.post('/form/:contactId/reply', authMiddleware, authorizeRoles("admin"), contactController.replyToContact);

// ADMIN ROUTES (Authentication + Admin role required)
router.delete('/form/:contactId',authMiddleware,authorizeRoles("admin"),contactController.deleteContactForm);

module.exports = router;
