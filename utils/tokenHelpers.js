const jwt = require('jsonwebtoken');

const isProduction = process.env.NODE_ENV === 'production';

/* These used to fall back to the literals 'dev-access-secret' and
   'dev-refresh-secret'. A deployment missing the env vars would boot happily
   and sign every token with a constant that is in the source — anyone could
   mint an admin token. Refuse to start instead. */
const requireSecret = (name) => {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(
      `${name} must be set to at least 32 characters. Generate one with:\n` +
        `  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
  return value;
};

const ACCESS_TOKEN_SECRET = requireSecret('ACCESS_TOKEN_SECRET');
const REFRESH_TOKEN_SECRET = requireSecret('REFRESH_TOKEN_SECRET');

/**
 * Generate an access token for a user
 */
const generateAccessToken = (user, additionalData = {}, expiresIn = '2h') => {
  const userId = typeof user === 'object' ? user._id : user;
  const userRole = typeof user === 'object' ? user.role : user;

  const payload = {
    id: userId,
    role: userRole,
    ...additionalData
  };

  if (!isProduction) console.log(`Generating AccessToken for user: ${userId}`);
  
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn });
};

/**
 * Generate a refresh token for a user
 */

// BUG: Refresh token cookie not being set/shown in production environment.
const generateRefreshToken = (user, additionalData = {}, expiresIn = '7d') => {
  const userId = typeof user === 'object' ? user._id : user;
  const userRole = typeof user === 'object' ? user.role : user;

  const payload = {
    id: userId,
    role: userRole,
    ...additionalData
  };

  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn });
};

/**
 * Set refresh token cookie in response
 */
const setRefreshTokenCookie = (res, token, maxAge = 7 * 24 * 60 * 60 * 1000) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'None' : 'Lax',
    maxAge
  });
};

/**
 * Clear refresh token cookie
 */
const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'None' : 'Lax'
  });
};

/**
 * Verify a token
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
