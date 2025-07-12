/**
 * @module middleware/multer
 * @description Multer middleware configuration for handling image file uploads
 * @requires multer
 * @requires path
 */
const multer = require('multer');
const path = require('path');

/**
 * Configure multer to store uploaded files in memory rather than on disk
 * Memory storage allows for direct buffer access to uploaded files, which is
 * useful for processing with cloudinary or other cloud storage services
 */
const storage = multer.memoryStorage();

/**
 * Custom file filter function to restrict uploads to image files only
 * 
 * @function fileFilter
 * @param {Object} req - Express request object
 * @param {Object} file - File object containing information about the uploaded file
 * @param {Function} cb - Callback function to indicate if the file should be accepted
 * @returns {void} Calls the callback with true if file is accepted, or an error if rejected
 * 
 * @description
 * This filter validates both the file extension and the MIME type to ensure
 * only JPEG, JPG, and PNG images are accepted for upload.
 */
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if(extname && mimetype) {
        return cb(null, true);
    }
    cb(new Error('Only images are allowed'));
};

/**
 * Configured multer middleware instance ready to use in routes
 * @type {Object}
 * 
 * @example
 * // In a route file:
 * const upload = require('../middleware/multer');
 * 
 * // For a single file upload named 'image' in the form
 * router.post('/upload', upload.single('image'), (req, res) => {
 *   // Access the file buffer with req.file.buffer
 *   // Then process or upload to a service like cloudinary
 * });
 */
const upload = multer({storage,fileFilter});

module.exports = upload;