require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { initDB } = require('./src/config/db');
const { initSeedData } = require('./src/seed/seedData');
const { getGlobalCookie } = require('./src/utils/platformBind');
const { initFromDB } = require('./src/utils/ncmAuth');
const app = require('./app');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDB();
    await initSeedData(require('./src/config/db').pool);

    // Restore platform cookies from DB so they survive server restarts
    try {
      await initFromDB(() => getGlobalCookie('netease'));
    } catch (e) { /* non-critical */ }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
