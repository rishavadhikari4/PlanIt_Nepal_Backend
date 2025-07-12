/**
 * @module config/cloudinaryConfig
 * @description Configuration and utility functions for Cloudinary image management
 * @requires cloudinary
 * @requires dotenv
 */
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

/**
 * Configure the Cloudinary SDK with credentials from environment variables
 * @requires CLOUDINARY_CLOUD_NAME - Cloudinary cloud name
 * @requires CLOUDINARY_API_KEY - Cloudinary API key
 * @requires CLOUDINARY_API_SECRET - Cloudinary API secret
 */
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload an image buffer to Cloudinary
 * @function uploadToCloudinary
 * @param {Buffer} fileBuffer - The binary buffer of the image to upload
 * @returns {Promise<Object>} A promise that resolves to the Cloudinary upload result
 * @property {string} result.public_id - The public ID of the uploaded image
 * @property {string} result.secure_url - The HTTPS URL of the uploaded image
 * @property {number} result.bytes - The size of the uploaded image in bytes
 * @property {string} result.format - The format of the uploaded image
 * @throws {Error} If the upload fails
 * @example
 * // Upload an image from a multer buffer
 * const result = await uploadToCloudinary(req.file.buffer);
 * console.log(result.secure_url); // https://res.cloudinary.com/cloud-name/image/upload/v1234567890/abcdef.jpg
 */
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

/**
 * Delete an image from Cloudinary by its public ID
 * @function deleteFromCloudinary
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<Object>} A promise that resolves to the Cloudinary deletion result
 * @property {string} result.result - "ok" if the deletion was successful
 * @throws {Error} If the deletion fails
 * @example
 * // Delete an image using its public ID
 * const result = await deleteFromCloudinary('user_profiles/user123');
 * if (result.result === 'ok') {
 *   console.log('Image deleted successfully');
 * }
 */
const deleteFromCloudinary = (publicId) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId,
            {resource_type: 'image'},
            (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
    });
};

module.exports = {
    uploadToCloudinary,
    deleteFromCloudinary
}