const mongoose = require('mongoose');
const Order = require('../models/order');
const Venue = require('../models/Venue');
const Studio = require('../models/studio');

/*
 * "What is free on the twelfth?"
 *
 * That is the first question anyone asks, and until now the site could only
 * answer it one listing at a time — you had to open a venue to find out it was
 * already taken. The booking data was always there; nothing read across it.
 *
 * A date is taken when a live order holds it. Cancelled lines do not hold
 * anything, and neither do draft orders — a draft is a cart, and a cart must
 * not be able to freeze the calendar for everyone else.
 */

const LIVE_ORDER_STATUSES = ['pending', 'processing', 'confirmed', 'completed'];
const HELD_ITEM_STATUSES = ['pending', 'confirmed'];

/** Parses YYYY-MM-DD as a UTC day, so a timezone cannot shift a booking. */
const parseDay = (value, endOfDay = false) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(
    Date.UTC(Number(y), Number(m) - 1, Number(d), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0),
  );
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * The ids of every venue and studio held during [from, till].
 *
 * Two ranges overlap when each starts before the other ends — the single
 * comparison that decides this whole feature.
 */
const heldItemIds = async (from, till) => {
  const held = await Order.aggregate([
    { $match: { status: { $in: LIVE_ORDER_STATUSES } } },
    { $unwind: '$items' },
    {
      $match: {
        'items.itemType': { $in: ['venue', 'studio'] },
        'items.bookingStatus': { $in: HELD_ITEM_STATUSES },
        'items.bookedFrom': { $lte: till },
        'items.bookedTill': { $gte: from },
      },
    },
    { $group: { _id: { type: '$items.itemType', id: '$items.itemId' } } },
  ]);

  return new Set(held.map((h) => `${h._id.type}:${h._id.id}`));
};

/**
 * GET /api/availability?from=YYYY-MM-DD&till=YYYY-MM-DD
 *
 * Optional: `guests` (venues that hold at least that many), `maxPrice`,
 * `location`, and `type` to ask for only venues or only studios.
 */
exports.searchAvailability = async (req, res) => {
  try {
    const from = parseDay(req.query.from);
    const till = parseDay(req.query.till || req.query.from, true);

    if (!from || !till) {
      return res.status(400).json({
        success: false,
        message: 'Give a date as from=YYYY-MM-DD, and optionally till=YYYY-MM-DD.',
      });
    }
    if (till < from) {
      return res.status(400).json({
        success: false,
        message: 'The last day cannot fall before the first.',
      });
    }

    // A year is more than anyone plans and keeps the scan bounded.
    const DAY = 24 * 60 * 60 * 1000;
    if (till - from > 366 * DAY) {
      return res.status(400).json({
        success: false,
        message: 'Search a range of a year or less.',
      });
    }

    const guests = Number(req.query.guests) || null;
    const maxPrice = Number(req.query.maxPrice) || null;
    const type = ['venue', 'studio'].includes(req.query.type) ? req.query.type : null;
    const limit = Math.min(Number(req.query.limit) || 24, 60);

    const venueFilter = {};
    const studioFilter = {};
    if (guests) venueFilter.capacity = { $gte: guests };
    if (maxPrice) {
      venueFilter.price = { $lte: maxPrice };
      studioFilter.price = { $lte: maxPrice };
    }
    if (req.query.location) {
      // Escaped upstream by the shared filter helper; kept as a plain prefix
      // match so the index on `location` is still usable.
      const { containsFilter } = require('../middleware/sanitize');
      venueFilter.location = containsFilter(req.query.location);
      studioFilter.location = containsFilter(req.query.location);
    }

    const [taken, venues, studios] = await Promise.all([
      heldItemIds(from, till),
      type === 'studio'
        ? []
        : Venue.find(venueFilter)
            .select('name location price capacity rating venueImage orderedCount')
            .sort({ orderedCount: -1, rating: -1 })
            .limit(limit * 2)
            .lean(),
      type === 'venue'
        ? []
        : Studio.find(studioFilter)
            .select('name location price rating studioImage services orderedCount')
            .sort({ orderedCount: -1, rating: -1 })
            .limit(limit * 2)
            .lean(),
    ]);

    const free = (items, itemType) =>
      items.filter((item) => !taken.has(`${itemType}:${item._id}`)).slice(0, limit);

    const freeVenues = free(venues, 'venue');
    const freeStudios = free(studios, 'studio');

    return res.status(200).json({
      success: true,
      message: 'Availability fetched successfully',
      data: {
        from: from.toISOString(),
        till: till.toISOString(),
        venues: freeVenues,
        studios: freeStudios,
        counts: {
          venues: freeVenues.length,
          studios: freeStudios.length,
          // How many were ruled out by the dates alone, which is the number
          // worth showing when a search comes back thin.
          venuesTaken: venues.length - freeVenues.length,
          studiosTaken: studios.length - freeStudios.length,
        },
      },
    });
  } catch (error) {
    console.error('Error searching availability:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET /api/availability/calendar?month=YYYY-MM
 *
 * One month across the whole catalogue, for the staff view of "what is
 * happening that Saturday". Returns a day-keyed map of the bookings held.
 */
exports.monthCalendar = async (req, res) => {
  try {
    const match = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || '').trim());
    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Give the month as month=YYYY-MM.',
      });
    }

    const [, y, m] = match;
    const from = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
    const till = new Date(Date.UTC(Number(y), Number(m), 0, 23, 59, 59));

    const rows = await Order.aggregate([
      { $match: { status: { $in: LIVE_ORDER_STATUSES } } },
      { $unwind: '$items' },
      {
        $match: {
          'items.itemType': { $in: ['venue', 'studio'] },
          'items.bookingStatus': { $in: HELD_ITEM_STATUSES },
          'items.bookedFrom': { $lte: till },
          'items.bookedTill': { $gte: from },
        },
      },
      {
        $project: {
          orderId: '$_id',
          status: 1,
          itemType: '$items.itemType',
          itemId: '$items.itemId',
          name: '$items.name',
          bookingStatus: '$items.bookingStatus',
          bookedFrom: '$items.bookedFrom',
          bookedTill: '$items.bookedTill',
        },
      },
      { $sort: { bookedFrom: 1 } },
    ]);

    /* Expand each booking across the days it covers, so the client renders a
       calendar cell by looking up one key rather than testing every range. */
    const days = {};
    const DAY = 24 * 60 * 60 * 1000;
    for (const row of rows) {
      const start = new Date(Math.max(row.bookedFrom.getTime(), from.getTime()));
      const end = new Date(Math.min(row.bookedTill.getTime(), till.getTime()));
      for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
        const key = new Date(t).toISOString().slice(0, 10);
        (days[key] ||= []).push({
          orderId: row.orderId,
          orderStatus: row.status,
          itemType: row.itemType,
          itemId: row.itemId,
          name: row.name,
          bookingStatus: row.bookingStatus,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Calendar fetched successfully',
      data: { month: `${y}-${m}`, days, total: rows.length },
    });
  } catch (error) {
    console.error('Error building calendar:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports.LIVE_ORDER_STATUSES = LIVE_ORDER_STATUSES;
module.exports.HELD_ITEM_STATUSES = HELD_ITEM_STATUSES;
