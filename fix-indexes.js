/*
 * Makes the database's indexes match what the schemas declare.
 *
 *   npm run indexes          report the difference, change nothing
 *   npm run indexes -- --apply   apply it
 *
 * Indexes are declared in models/*.js, so the schemas are the single source of
 * truth and this script only carries them across. It uses Mongoose's own
 * diffIndexes/syncIndexes, which means anything the database has that no
 * schema asks for gets dropped.
 *
 * That matters here, because two such indexes existed and both broke ordinary
 * writes:
 *
 *   cuisines.dishes.ratings.userId_1  UNIQUE
 *     Not in Cuisine.js. Unrated dishes all index as null, so the second
 *     category ever inserted collided — adding a dish failed with E11000.
 *
 *   users.number_1  UNIQUE but not sparse
 *     User.js declares sparse. Without it a missing phone number indexes as
 *     null, so only one account could ever lack one and the second Google
 *     sign-up failed.
 */
require('dotenv').config();
const mongoose = require('mongoose');

/* Mongoose builds declared indexes automatically the moment a model's
   connection opens, which would make the dry run lie — it would report a diff
   it had already started applying. Turn that off so this script is the only
   thing that touches indexes. */
mongoose.set('autoIndex', false);

const MODELS = [
  ['Venue', require('./models/Venue')],
  ['Studio', require('./models/studio')],
  ['Cuisine', require('./models/Cuisine')],
  ['User', require('./models/User')],
  ['Order', require('./models/order')],
  ['Review', require('./models/review')],
  ['Contact', require('./models/Contact')],
];

const apply = process.argv.includes('--apply');

const describe = (spec) => {
  const [keys, options = {}] = Array.isArray(spec) ? spec : [spec, {}];
  const flags = [
    options.unique && 'unique',
    options.sparse && 'sparse',
    options.name && options.name.endsWith('_text') && 'text',
  ].filter(Boolean);
  return `${JSON.stringify(keys)}${flags.length ? ' [' + flags.join(', ') + ']' : ''}`;
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(
    `connected to ${mongoose.connection.name}` +
      (apply ? '\n' : '   (dry run — pass --apply to change anything)\n'),
  );

  let drops = 0;
  let creates = 0;

  for (const [label, Model] of MODELS) {
    const { toDrop, toCreate } = await Model.diffIndexes();

    if (toDrop.length === 0 && toCreate.length === 0) {
      console.log(`${label.padEnd(9)} up to date`);
      continue;
    }

    console.log(label);
    toDrop.forEach((name) => console.log(`  ${apply ? 'drop  ' : '-'} ${name}`));
    toCreate.forEach((spec) => console.log(`  ${apply ? 'create' : '+'} ${describe(spec)}`));
    drops += toDrop.length;
    creates += toCreate.length;

    if (apply) {
      await Model.syncIndexes();
      console.log('  applied');
    }
  }

  console.log(
    `\n${apply ? 'applied' : 'would apply'}: ${drops} drop${drops === 1 ? '' : 's'}, ` +
      `${creates} create${creates === 1 ? '' : 's'}`,
  );

  if (apply) {
    console.log('\nfinal state:');
    for (const [label, Model] of MODELS) {
      const idx = await Model.collection.indexes();
      const names = idx
        .filter((i) => i.name !== '_id_')
        .map((i) => i.name + (i.unique ? (i.sparse ? '(unique,sparse)' : '(unique)') : ''));
      console.log(`  ${label.padEnd(9)} ${names.length ? names.join(', ') : '—'}`);
    }
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('\nfailed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
