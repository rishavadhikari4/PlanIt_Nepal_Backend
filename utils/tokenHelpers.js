/**
 * Token utility functions for authentication
 */
const jwt = require('jsonwebtoken');

/**
 * Generate an access token for a user
 * @param {Object} user - User object or ID
 * @param {Object} additionalData - Additional data to include in token (optional)
 * @param {string} expiresIn - Token expiration time (default: '2h')
 * @returns {string} JWT access token
 */
const generateAccessToken = (user, additionalData = {}, expiresIn = '2h') => {
  const userId = typeof user === 'object' ? user._id : user;
  
  const payload = {
    id: userId,
    ...additionalData
  };
  
  return jwt.sign(
    payload,
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn }
  );
};

/**
 * Generate a refresh token for a user
 * @param {Object} user - User object or ID
 * @param {string} expiresIn - Token expiration time (default: '7d')
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user, expiresIn = '7d') => {
  const userId = typeof user === 'object' ? user._id : user;
  
  return jwt.sign(
    { id: userId },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn }
  );
};

/**
 * Set refresh token cookie in response
 * @param {Object} res - Express response object
 * @param {string} token - Refresh token
 * @param {number} maxAge - Cookie max age in milliseconds (default: 7 days)
 */
const setRefreshTokenCookie = (res, token, maxAge = 7 * 24 * 60 * 60 * 1000) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge
  });
};

/**
 * Clear refresh token cookie
 * @param {Object} res - Express response object
 */
const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });
};

/**
 * Verify a token
 * @param {string} token - JWT token to verify
 * @param {string} secret - Secret key
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token, secret) => {
  return jwt.verify(token, secret);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  verifyToken
};