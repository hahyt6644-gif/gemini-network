const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/trace', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "Missing url parameter" });

    let browser;
    try {
        // Render requires specific flags to run Chrome in a container
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        const networkLogs = [];

        // Enable Request Interception to see method and headers
        await page.setRequestInterception(true);
        page.on('request', req => {
            networkLogs.push({
                type: 'REQUEST',
                method: req.method(),
                url: req.url(),
                resourceType: req.resourceType()
            });
            req.continue();
        });

        // Capture Responses (Status and Body)
        page.on('response', async response => {
            const log = {
                type: 'RESPONSE',
                url: response.url(),
                status: response.status()
            };
            
            // Only try to get JSON for API calls (Fetch/XHR) to save memory
            const type = response.request().resourceType();
            if (type === 'fetch' || type === 'xhr') {
                try { log.data = await response.json(); } catch { log.data = "Not JSON"; }
            }
            networkLogs.push(log);
        });

        // Go to URL and wait until the network is quiet
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        await browser.close();
        res.json({ success: true, total_calls: networkLogs.length, logs: networkLogs });

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => console.log(`API active on port ${PORT}`));
