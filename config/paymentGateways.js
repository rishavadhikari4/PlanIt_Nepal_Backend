const crypto = require('crypto');
require('dotenv').config();

/*
 * Khalti and Fonepay are the two gateways Nepali customers actually reach for.
 * Both are redirect gateways: we hand the customer to the gateway, they come
 * back to our return URL, and we then ask the gateway (Khalti) or re-derive the
 * signature (Fonepay) to find out what really happened. The query string the
 * browser comes back with is never trusted on its own.
 */

const isLive = process.env.PAYMENT_MODE === 'live';

const khalti = {
  enabled: Boolean(process.env.KHALTI_SECRET_KEY),
  baseUrl: isLive ? 'https://khalti.com' : 'https://dev.khalti.com',
  secretKey: process.env.KHALTI_SECRET_KEY,
  // Khalti rejects anything under 10 NPR.
  minAmountPaisa: 1000,
};

const fonepay = {
  enabled: Boolean(process.env.FONEPAY_MERCHANT_CODE && process.env.FONEPAY_SECRET_KEY),
  baseUrl: isLive
    ? 'https://clientapi.fonepay.com/api'
    : 'https://dev-clientapi.fonepay.com/api',
  merchantCode: process.env.FONEPAY_MERCHANT_CODE,
  secretKey: process.env.FONEPAY_SECRET_KEY,
};

/** Fonepay signs a comma-joined field list with HMAC-SHA512, hex encoded. */
const fonepayDigest = (fields) =>
  crypto.createHmac('sha512', fonepay.secretKey).update(fields.join(',')).digest('hex');

/** MM/DD/YYYY — the only date format Fonepay's merchantRequest accepts. */
const fonepayDate = (d = new Date()) =>
  `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

const timingSafeEqual = (a = '', b = '') => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

/** The field order Fonepay signs its redirect request with. */
const fonepayRequestDigest = ({ PID, MD, PRN, AMT, CRN, DT, R1, R2 }) =>
  fonepayDigest([PID, MD, PRN, AMT, CRN, DT, R1, R2]);

/**
 * Fonepay signs its response with the same shared secret over a different
 * field list. If the digest does not re-derive, the query string was edited on
 * the way back and the payment must not be honoured.
 */
const fonepayResponseIsAuthentic = (query = {}) => {
  const { PRN, PID, PS, RC, UID, BC, INI, P_AMT, R_AMT, DV } = query;
  if (!DV) return false;
  return timingSafeEqual(fonepayDigest([PRN, PID, PS, RC, UID, BC, INI, P_AMT, R_AMT]), DV);
};

module.exports = {
  isLive,
  khalti,
  fonepay,
  fonepayDigest,
  fonepayDate,
  fonepayRequestDigest,
  fonepayResponseIsAuthentic,
  timingSafeEqual,
};
