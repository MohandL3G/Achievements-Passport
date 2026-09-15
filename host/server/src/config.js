require('dotenv').config();
const path = require('path');

const PORT = parseInt(process.env.PORT || '3281', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
const STEAM_API_KEY = process.env.STEAM_API_KEY || '';
const OWNER_STEAMID = process.env.OWNER_STEAMID || '';
const COOKIE_SECRET = process.env.COOKIE_SECRET || '';
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const BASE_URL = process.env.BASE_URL || '';
const DEFAULT_CRON = process.env.SCHEDULE_CRON || '0 0 * * *';
const FRONTEND_DIST = path.resolve(__dirname, '..', '..', 'frontend', 'dist');

const STEAM_OPENID_LOGIN = 'https://steamcommunity.com/openid/login';
const STEAMAPI_BASE = 'https://api.steampowered.com';
const STEAMID64_OFFSET = 76561197960265728;

module.exports = {
  PORT,
  HOST,
  DATA_DIR,
  STEAM_API_KEY,
  OWNER_STEAMID,
  COOKIE_SECRET,
  ENCRYPTION_SECRET,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  BASE_URL,
  DEFAULT_CRON,
  FRONTEND_DIST,
  STEAM_OPENID_LOGIN,
  STEAMAPI_BASE,
  STEAMID64_OFFSET,
};