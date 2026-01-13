const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/trace', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "Missing url parameter" });

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            // These flags are mandatory for Render/Docker environments
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        const networkLogs = [];

        // Catch the API calls
        page.on('response', async (response) => {
            const request = response.request();
            if (['fetch', 'xhr'].includes(request.resourceType())) {
                const log = {
                    url: response.url(),
                    method: request.method(),
                    status: response.status(),
                };
                // Only try to grab data if status is OK
                if (response.status() === 200) {
                    try { log.data = await response.json(); } catch { log.data = "Check response manually"; }
                }
                networkLogs.push(log);
            }
        });

        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await browser.close();

        res.json({ success: true, logs: networkLogs });

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: err.message });
    }
});

// Simple landing page for your API
app.get('/', (req, res) => {
    res.send('API is Live. Use /trace?url=YOUR_URL_HERE');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
