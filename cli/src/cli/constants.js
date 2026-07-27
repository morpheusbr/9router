const path = require("path");

const APP_NAME = "HiperRouter";
const DEFAULT_PORT = 20128;
const DEFAULT_HOST = "0.0.0.0";
const MAX_PORT_ATTEMPTS = 10;

const PORT_MIN = 1024;
const PORT_MAX = 65535;

const PROCESS_IDENTIFIERS = [
  "9router",
  "hiperrouter"
];

module.exports = {
  APP_NAME,
  DEFAULT_PORT,
  DEFAULT_HOST,
  MAX_PORT_ATTEMPTS,
  PORT_MIN,
  PORT_MAX,
  PROCESS_IDENTIFIERS,
};
