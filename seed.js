/*
 * Seeds the catalogue with realistic Nepali content.
 *
 *   npm run seed             add anything missing, touch nothing else
 *   npm run seed -- --fresh  clear the catalogue first, then seed
 *
 * Matching is by name (or category), so the default run is idempotent — run it
 * as often as you like and it will only ever fill in gaps.
 *
 * --fresh only ever clears venues, studios and cuisines. Users, orders,
 * reviews and contacts are never deleted by this script.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Venue = require('./models/Venue');
const Studio = require('./models/studio');
const Cuisine = require('./models/Cuisine');
const User = require('./models/User');

const img = (id) => `https://images.unsplash.com/photo-${id}?w=1400&q=80&auto=format&fit=crop`;

/* ------------------------------------------------------------------ *
 * Venues
 * ------------------------------------------------------------------ */
const VENUES = [
  {
    name: 'Hyatt Regency Garden Lawn',
    location: 'Boudha, Kathmandu',
    capacity: '600',
    price: 285000,
    rating: 4.7,
    description:
      'A walled lawn of just under two acres inside the Hyatt grounds, with the Boudhanath stupa visible over the treeline. Covered service corridor to the hotel kitchen, a permanent stage platform, and parking for ninety cars. Generator backup included.',
    venueImage: img('1519167758481-83f550bb49b3'),
    photos: ['1464366400600-7168b8af9bc3', '1478146059778-26028b07395a'],
  },
  {
    name: 'Babar Mahal Revisited Courtyard',
    location: 'Babar Mahal, Kathmandu',
    capacity: '180',
    price: 165000,
    rating: 4.8,
    description:
      'A restored Rana-era stable courtyard of brick and carved sal wood, open to the sky and lit by iron lanterns after dark. Suited to seated dinners and receptions rather than large ceremonies. No amplified music past 10pm.',
    venueImage: img('1511795409834-ef04bbd61622'),
    photos: ['1519741497674-611481863552'],
  },
  {
    name: 'Gokarna Forest Terrace',
    location: 'Gokarna, Kathmandu',
    capacity: '350',
    price: 210000,
    rating: 4.6,
    description:
      'A stepped terrace on the edge of the Gokarna forest reserve, overlooking the old royal golf course. Deer come to the fence at dusk. Marquee frame and flooring are part of the hire; sides are extra during monsoon.',
    venueImage: img('1519741497674-611481863552'),
    photos: ['1505236858219-8359eb29e329'],
  },
  {
    name: 'Patan Durbar Heritage Hall',
    location: 'Mangal Bazar, Lalitpur',
    capacity: '220',
    price: 140000,
    rating: 4.5,
    description:
      'A first-floor hall in a restored Newari townhouse two minutes from Patan Durbar Square, with original tikijhya windows and a low carved ceiling. Access is by a narrow stair, so it suits ceremonies rather than heavy staging.',
    venueImage: img('1478146059778-26028b07395a'),
    photos: [],
  },
  {
    name: 'Soaltee Crystal Ballroom',
    location: 'Tahachal, Kathmandu',
    capacity: '900',
    price: 340000,
    rating: 4.4,
    description:
      'The largest indoor room on this list: a pillarless ballroom with a twelve-metre ceiling, full rigging points, and its own entrance and cloakroom. Air-conditioned throughout. Standard hire covers eight hours and a two-hour set-up window.',
    venueImage: img('1505236858219-8359eb29e329'),
    photos: ['1522413452208-996ff3f3e740'],
  },
  {
    name: 'Dhulikhel Ridge Pavilion',
    location: 'Dhulikhel, Kavre',
    capacity: '250',
    price: 175000,
    rating: 4.9,
    description:
      'An open pavilion on the ridge above Dhulikhel with an uninterrupted line of the Langtang and Ganesh ranges on a clear morning. An hour and a half from Kathmandu. Best booked October to December for the mountain views.',
    venueImage: img('1522413452208-996ff3f3e740'),
    photos: ['1600093463592-8e36ae95ef56', '1519167758481-83f550bb49b3'],
  },
  {
    name: 'Pokhara Lakeside Deck',
    location: 'Lakeside, Pokhara',
    capacity: '160',
    price: 120000,
    rating: 4.6,
    description:
      'A timber deck built out over Phewa Tal, reached by a short walk from the Lakeside road. Boats can bring guests across from the far shore. Capacity is limited by the deck rather than the venue, and is enforced.',
    venueImage: img('1600093463592-8e36ae95ef56'),
    photos: [],
  },
  {
    name: 'Kirtipur Community Bhoj Hall',
    location: 'Kirtipur, Kathmandu',
    capacity: '400',
    price: 65000,
    rating: 4.2,
    description:
      'A plain, well-run municipal hall built for traditional bhoj seating, with a full commercial kitchen attached and mats stored on site. The cheapest large room in the valley, and the one most families actually use.',
    venueImage: img('1464366400600-7168b8af9bc3'),
    photos: [],
  },
];

/* ------------------------------------------------------------------ *
 * Studios
 * ------------------------------------------------------------------ */
const STUDIOS = [
  {
    name: 'Aperture Kathmandu',
    location: 'Jhamsikhel, Lalitpur',
    price: 85000,
    rating: 4.8,
    services: ['Wedding Photography', 'Pre-wedding Shoot', 'Album Design', 'Digital Copies'],
    description:
      'A two-person team shooting documentary style — no posed group lines unless you ask for them. You get a set of edited previews within the week and the full gallery inside a month, plus a printed album of forty spreads.',
    studioImage: img('1452587925148-ce544e77e70d'),
    photos: ['1606216794074-735e91aa2c92'],
  },
  {
    name: 'Himalaya Frames',
    location: 'Thamel, Kathmandu',
    price: 130000,
    rating: 4.6,
    services: ['Wedding Photography', 'Video Recording', 'Drone Photography', 'Digital Copies'],
    description:
      'The team to call when you want aerials. Licensed for drone work inside the valley, with a four-person crew covering stills and video across two days. Same-day highlight reel is available for an extra fee.',
    studioImage: img('1606216794074-735e91aa2c92'),
    photos: ['1502920917128-1aa500764cbd'],
  },
  {
    name: 'Newa Studio',
    location: 'Patan, Lalitpur',
    price: 60000,
    rating: 4.7,
    services: ['Wedding Photography', 'Pre-wedding Shoot', 'Album Design'],
    description:
      'Specialists in Newari ceremonies — ihi, bel bibaha, bratabandha — who know the order of a ritual well enough to be in the right place without being told. Stills only, one photographer, delivered as a printed album.',
    studioImage: img('1502920917128-1aa500764cbd'),
    photos: [],
  },
  {
    name: 'Everest Motion Pictures',
    location: 'Baneshwor, Kathmandu',
    price: 155000,
    rating: 4.5,
    services: ['Video Recording', 'Drone Photography', 'Digital Copies', 'Album Design'],
    description:
      'A cinema-first outfit: two operators on gimbals, a third on a long lens, and a proper colour grade afterwards. Expect a twelve-minute film rather than a three-hour recording of the whole day.',
    studioImage: img('1554048612-b6a482bc67e5'),
    photos: ['1452587925148-ce544e77e70d'],
  },
  {
    name: 'Lens & Light Pokhara',
    location: 'Lakeside, Pokhara',
    price: 70000,
    rating: 4.4,
    services: ['Wedding Photography', 'Pre-wedding Shoot', 'Digital Copies'],
    description:
      'Pokhara-based, so no travel charge for events around the lake. Best known for pre-wedding shoots at Sarangkot before sunrise, which they will book on a separate morning to the main event.',
    studioImage: img('1452587925148-ce544e77e70d'),
    photos: [],
  },
];

/* ------------------------------------------------------------------ *
 * Catering — priced per plate
 * ------------------------------------------------------------------ */
const CUISINES = [
  {
    category: 'Newari khaja set',
    dishes: [
      { name: 'Chatamari', price: 180, rating: 4.7, image: img('1567337710282-00832b415979'), description: 'Rice-flour crepe cooked on a flat pan and topped with minced buff, egg and coriander. Served hot off the tawa.' },
      { name: 'Bara', price: 150, rating: 4.5, image: img('1585937421612-70a008356fbe'), description: 'Black lentil patty fried till the edges crisp, with an egg broken over it. The plain version is vegetarian.' },
      { name: 'Choila', price: 320, rating: 4.8, image: img('1631452180519-c014fe946bc7'), description: 'Buff grilled over open flame, then tossed with mustard oil, timur and dried chilli. Hot, and meant to be.' },
      { name: 'Samay Baji platter', price: 450, rating: 4.9, image: img('1601050690597-df0568f70950'), description: 'The full ceremonial plate: beaten rice, choila, black soybean, boiled egg, ginger, and a measure of aila.' },
    ],
  },
  {
    category: 'Nepali thali',
    dishes: [
      { name: 'Veg thali', price: 380, rating: 4.4, image: img('1606491956689-2ea866880c84'), description: 'Rice, dal, two seasonal vegetables, saag, achar, papad and curd. Refills on rice and dal are included.' },
      { name: 'Chicken thali', price: 520, rating: 4.6, image: img('1596797038530-2c107229654b'), description: 'The veg thali plus a bone-in chicken curry cooked in the Thakali style, with the same refills.' },
      { name: 'Mutton thali', price: 680, rating: 4.7, image: img('1631452180519-c014fe946bc7'), description: 'Slow-cooked goat curry with rice, dal, greens and achar. Ordered by the plate, not by weight.' },
      { name: 'Dal bhat with khasi', price: 620, rating: 4.5, image: img('1512058564366-18510be2db19'), description: 'The everyday plate done properly: aged rice, thick masyaura dal, and goat cooked down for four hours.' },
    ],
  },
  {
    category: 'Snacks and street',
    dishes: [
      { name: 'Buff momo (10 pcs)', price: 260, rating: 4.9, image: img('1626074353765-517a681e40be'), description: 'Hand-pleated and steamed to order, with a sesame-tomato achar on the side. Counted per plate of ten.' },
      { name: 'Veg momo (10 pcs)', price: 220, rating: 4.6, image: img('1626074353765-517a681e40be'), description: 'Cabbage, carrot and paneer, steamed. The same achar, without the buff stock in it.' },
      { name: 'Sekuwa skewers', price: 340, rating: 4.7, image: img('1567337710282-00832b415979'), description: 'Marinated meat grilled over charcoal at the station, so guests take them straight off the fire.' },
      { name: 'Aloo chop', price: 120, rating: 4.2, image: img('1585937421612-70a008356fbe'), description: 'Spiced potato, battered and fried. The cheapest thing on the menu and usually the first to go.' },
    ],
  },
  {
    category: 'Continental',
    dishes: [
      { name: 'Grilled chicken steak', price: 720, rating: 4.3, image: img('1596797038530-2c107229654b'), description: 'Breast fillet with rosemary potatoes and a pepper sauce. Cooked to order at a live station.' },
      { name: 'Penne arrabbiata', price: 450, rating: 4.1, image: img('1601050690597-df0568f70950'), description: 'Tomato, garlic and dried chilli, finished with parmesan. Vegetarian as served.' },
      { name: 'Garden salad', price: 260, rating: 4.0, image: img('1606491956689-2ea866880c84'), description: 'Leaves, cucumber, tomato and a light vinaigrette, dressed at the table so it holds through service.' },
    ],
  },
  {
    category: 'Sweets',
    dishes: [
      { name: 'Juju dhau', price: 200, rating: 4.9, image: img('1512058564366-18510be2db19'), description: 'The king curd of Bhaktapur, set in its clay pot. Sweet, thick, and served in the pot it came in.' },
      { name: 'Lal mohan (2 pcs)', price: 140, rating: 4.5, image: img('1585937421612-70a008356fbe'), description: 'Fried milk-solid dumplings soaked in cardamom syrup. Served warm.' },
      { name: 'Sel roti', price: 90, rating: 4.4, image: img('1626074353765-517a681e40be'), description: 'Ring of sweetened rice batter fried fresh. Traditional at Tihar and at most weddings regardless.' },
    ],
  },
];

/* ------------------------------------------------------------------ */

const photos = (ids) => ids.map((id) => ({ image: img(id), imageId: null }));

const seed = async () => {
  const fresh = process.argv.includes('--fresh');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`connected to ${mongoose.connection.name}\n`);

  if (fresh) {
    // Catalogue only. Users, orders, reviews and contacts are never touched.
    const [v, s, c] = await Promise.all([
      Venue.deleteMany({}),
      Studio.deleteMany({}),
      Cuisine.deleteMany({}),
    ]);
    console.log(`--fresh: cleared ${v.deletedCount} venues, ${s.deletedCount} studios, ${c.deletedCount} categories\n`);
  }

  /* ---- Venues ---- */
  let added = 0;
  for (const v of VENUES) {
    if (await Venue.findOne({ name: v.name })) continue;
    await Venue.create({ ...v, photos: photos(v.photos), totalRatings: Math.round(v.rating * 7) });
    added++;
  }
  console.log(`venues:    +${added}  (${await Venue.countDocuments()} total)`);

  /* ---- Studios ---- */
  added = 0;
  for (const s of STUDIOS) {
    if (await Studio.findOne({ name: s.name })) continue;
    await Studio.create({ ...s, photos: photos(s.photos), totalRatings: Math.round(s.rating * 5) });
    added++;
  }
  console.log(`studios:   +${added}  (${await Studio.countDocuments()} total)`);

  /* ---- Catering ---- */
  let newCategories = 0;
  let newDishes = 0;
  for (const c of CUISINES) {
    const existing = await Cuisine.findOne({ category: c.category });
    if (!existing) {
      await Cuisine.create(c);
      newCategories++;
      newDishes += c.dishes.length;
      continue;
    }
    // Category is already there — top up any dishes it is missing.
    const have = new Set(existing.dishes.map((d) => d.name));
    const missing = c.dishes.filter((d) => !have.has(d.name));
    if (missing.length) {
      existing.dishes.push(...missing);
      await existing.save();
      newDishes += missing.length;
    }
  }
  const dishTotal = (await Cuisine.find()).reduce((n, c) => n + c.dishes.length, 0);
  console.log(`catering:  +${newCategories} categories, +${newDishes} dishes  (${dishTotal} dishes total)`);

  /* ---- Admin ---- */
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`admin:     ${email} already exists — password left alone`);
    } else {
      await User.create({
        name: 'PlanIt Admin',
        email,
        password: await bcrypt.hash(password, 10),
        role: 'admin',
        verified: true,
      });
      console.log(`admin:     created ${email}`);
    }
  }

  console.log('\ndone.');
  await mongoose.disconnect();
};

seed().catch(async (err) => {
  console.error('\nseed failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
