require('dotenv').config();
const { PORT } = require('./src/config/env');
const { initDb } = require('./src/db/migrate');
const app = require('./src/app');

(async () => {
  try {
    await initDb(); // identical schema bootstrap as your old server.js
    app.listen(PORT, () => console.log(`Modular server running on :${PORT}`));
  } catch (e) {
    console.error('Failed to start server:', e);
    process.exit(1);
  }
})();
