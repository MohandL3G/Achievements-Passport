require('dotenv').config();
const config = require('./src/config');
const { createApp } = require('./src/app');
const { startScheduler } = require('./src/lib/scheduler');
const { writeLog } = require('./src/lib/storage');

if (!config.COOKIE_SECRET || !config.ENCRYPTION_SECRET) {
  console.error('FATAL: .env is missing COOKIE_SECRET and/or ENCRYPTION_SECRET.');
  process.exit(1);
}

if (!config.STEAM_API_KEY) {
  console.warn('WARN: STEAM_API_KEY is not set — Steam data will be unavailable (CloudRedirect uploads still work).');
}
if (!config.ADMIN_PASSWORD) {
  console.warn('WARN: ADMIN_PASSWORD is not set — the admin panel login is disabled.');
}

const app = createApp();

app.listen(config.PORT, config.HOST, () => {
  writeLog('server started');
  console.log(`Achievements Passport listening on http://${config.HOST}:${config.PORT}`);
});

startScheduler();

module.exports = app;