const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Tells Puppeteer to install the browser inside your project folder
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
