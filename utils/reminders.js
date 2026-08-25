const Order = require('../models/order');
const { sendOrderReminderEmail } = require('./emailHelper');

/*
 * Two letters nobody was sending.
 *
 * An order paid with a 25% advance leaves a balance that came due silently —
 * the customer heard nothing until someone phoned them. And once an event had
 * happened, nothing ever asked how it went, which is why the reviews wall is
 * empty.
 *
 * Both are found by querying, not by scheduling a job per order: a scheduled
 * job would be lost on every restart, and the dates it depends on can change
 * after it is queued.
 */

const DAY = 24 * 60 * 60 * 1000;

/* Marks are written onto the order itself rather than a separate collection,
   because "has this been sent?" is a property of the order and nothing else
   ever needs to ask. */
const REMINDER_FIELDS = {
  balance_due: 'balanceReminderSentAt',
  review_request: 'reviewRequestSentAt',
};

/** The soonest live booking on an order. */
const eventDateOf = (order) =>
  (order.items || [])
    .filter((i) => i.bookedFrom && i.bookingStatus !== 'cancelled')
    .map((i) => new Date(i.bookedFrom).getTime())
    .sort((a, b) => a - b)[0] || null;

/** The latest live booking, which is when the event is actually over. */
const eventEndOf = (order) =>
  (order.items || [])
    .filter((i) => i.bookedTill && i.bookingStatus !== 'cancelled')
    .map((i) => new Date(i.bookedTill).getTime())
    .sort((a, b) => b - a)[0] || null;

const send = async (order, kind) => {
  const user = order.userId;
  if (!user?.email) return false;

  await sendOrderReminderEmail({ order, user, kind });
  await Order.updateOne({ _id: order._id }, { $set: { [REMINDER_FIELDS[kind]]: new Date() } });
  return true;
};

/**
 * Orders with money still owed whose event is within `daysAhead`.
 *
 * Deliberately not sent the day before: the point is to give someone time to
 * arrange the payment, not to surprise them on the morning.
 */
const sendBalanceReminders = async ({ daysAhead = 7 } = {}) => {
  const horizon = new Date(Date.now() + daysAhead * DAY);

  const orders = await Order.find({
    status: { $in: ['confirmed', 'processing'] },
    paymentStatus: 'partial',
    remainingAmount: { $gt: 0 },
    balanceReminderSentAt: null,
    'items.bookedFrom': { $lte: horizon, $gte: new Date() },
  })
    .populate('userId', 'name email')
    .limit(100);

  let sent = 0;
  for (const order of orders) {
    const eventDate = eventDateOf(order);
    if (!eventDate || eventDate > horizon.getTime()) continue;
    try {
      if (await send(order, 'balance_due')) sent += 1;
    } catch (error) {
      console.error(`Balance reminder failed for order ${order._id}:`, error.message);
    }
  }
  return sent;
};

/**
 * Orders whose event finished at least `daysAfter` days ago.
 *
 * The delay is not politeness — it is so the customer has actually been to
 * the thing before being asked to judge it.
 */
const sendReviewRequests = async ({ daysAfter = 2 } = {}) => {
  const cutoff = new Date(Date.now() - daysAfter * DAY);

  const orders = await Order.find({
    status: { $in: ['confirmed', 'completed'] },
    paymentStatus: { $in: ['partial', 'completed'] },
    reviewRequestSentAt: null,
    // Anything older than a month is water under the bridge.
    'items.bookedTill': { $lte: cutoff, $gte: new Date(Date.now() - 30 * DAY) },
  })
    .populate('userId', 'name email')
    .limit(100);

  let sent = 0;
  for (const order of orders) {
    const end = eventEndOf(order);
    if (!end || end > cutoff.getTime()) continue;
    try {
      if (await send(order, 'review_request')) sent += 1;
    } catch (error) {
      console.error(`Review request failed for order ${order._id}:`, error.message);
    }
  }
  return sent;
};

/** One pass of both. Returns what it sent, so a caller can log or report it. */
const runReminders = async () => {
  const [balance, reviews] = await Promise.all([
    sendBalanceReminders().catch((e) => {
      console.error('Balance reminder sweep failed:', e.message);
      return 0;
    }),
    sendReviewRequests().catch((e) => {
      console.error('Review request sweep failed:', e.message);
      return 0;
    }),
  ]);
  return { balanceReminders: balance, reviewRequests: reviews };
};

module.exports = { runReminders, sendBalanceReminders, sendReviewRequests };
