/* dotenv has to run before anything reads process.env. It used to be called
   after PORT was read and after passportConfig was required, so both silently
   saw undefined — PORT fell back to 5000 whatever .env said. */
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const passport = require("passport");
const cors = require("cors");
const cookieParser = require('cookie-parser');
const { sanitize } = require('./middleware/sanitize');

const connectDB = require('./config/dbConfig');
require('./config/passportConfig');

const routes = require('./routes/index');

const PORT = process.env.PORT || 5000;

const app = express();


const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

/* Security headers. The API serves JSON to a separate origin, so the CSP and
   frame rules that matter for HTML are not the point — HSTS, nosniff and a
   referrer policy are. crossOriginResourcePolicy is relaxed because the
   frontend is on a different origin. */
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));
app.disable("x-powered-by");

/* An explicit ceiling on request bodies. Images go through multer, which has
   its own limit, so nothing legitimate needs more than this. */
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:8080",
    process.env.PREVIEW_URL
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(cookieParser());

/* Rejects Mongo operators in body, query and params. Must sit before any
   route that puts a request value into a query. */
app.use(sanitize);

app.use(passport.initialize());
app.set("trust proxy", 1);

connectDB();

app.use('/api', routes);

/* Settle payments the gateways never told us about.
   Webhooks are the primary path, but a merchant account can go live before
   its callback URL is registered, and a webhook can simply be lost. Sweeping
   every fifteen minutes means the worst case for a customer whose tab closed
   mid-payment is a short wait, not a booking that never happened. */
const { reconcilePending } = require('./controllers/paymentController');
const RECONCILE_EVERY_MS = 15 * 60 * 1000;

const sweepPendingPayments = async () => {
  try {
    const report = await reconcilePending();
    if (report.settled.length) {
      console.log(`Reconciliation settled ${report.settled.length} abandoned payment(s)`);
    }
    if (report.unresolved.length) {
      console.warn(`Reconciliation left ${report.unresolved.length} payment(s) for manual review`);
    }
  } catch (error) {
    console.error('Payment reconciliation sweep failed:', error.message);
  }
};

// unref() so the timer never keeps the process alive on its own.
setInterval(sweepPendingPayments, RECONCILE_EVERY_MS).unref();

/* Balance-due and how-was-it letters. Hourly is often enough for something
   measured in days, and both are found by query, so a restart loses nothing. */
const { runReminders } = require('./utils/reminders');
const REMIND_EVERY_MS = 60 * 60 * 1000;

const sweepReminders = async () => {
  try {
    const sent = await runReminders();
    if (sent.balanceReminders || sent.reviewRequests) {
      console.log(
        `Reminders sent — balance due: ${sent.balanceReminders}, review requests: ${sent.reviewRequests}`,
      );
    }
  } catch (error) {
    console.error('Reminder sweep failed:', error.message);
  }
};

setInterval(sweepReminders, REMIND_EVERY_MS).unref();

if (isProduction) {
    app.listen(PORT, () => {
        console.log(`Production server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV}`);
        console.log(`Server URL: ${process.env.FRONTEND_URL || 'Not configured'}`);
        console.log(`MongoDB: Connected to production database`);
        console.log(`Security: Production mode enabled`);
    });
} else if (isDevelopment) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Development server running on http://localhost:${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`Network access: http://0.0.0.0:${PORT}`);
        console.log(`Local access: http://localhost:${PORT}`);
        console.log(`Network access: http://192.168.1.73:${PORT}`);
        console.log(`Development features enabled`);
        console.log(`API Routes: http://localhost:${PORT}/api`);
    });
} else {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT} (environment not specified)`);
        console.log(`Environment: ${process.env.NODE_ENV || 'not set'}`);
        console.log(`Tip: Set NODE_ENV=production or NODE_ENV=development`);
    });
}

