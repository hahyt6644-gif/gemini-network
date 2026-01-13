const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/trace', async (req, res) => {
    const targetUrl = req.query.url;
    // Get time from 't' parameter, default to 20, max 50 (to stay under Render's timeout)
    const waitTimeSec = Math.min(parseInt(req.query.t) || 20, 50); 

    if (!targetUrl) return res.status(400).json({ error: "Missing url parameter" });

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        const networkLogs = [];

        // Track Responses
        page.on('response', async (response) => {
            const request = response.request();
            // Capture Fetch, XHR, and Document/Scripts to see more data
            if (['fetch', 'xhr', 'document', 'script'].includes(request.resourceType())) {
                const log = {
                    url: response.url(),
                    method: request.method(),
                    status: response.status(),
                    type: request.resourceType()
                };

                if (response.status() === 200) {
                    try {
                        const contentType = response.headers()['content-type'] || '';
                        if (contentType.includes('application/json')) {
                            log.data = await response.json();
                        } else {
                            // Capture text data but trim it so the response isn't too huge
                            const text = await response.text();
                            log.data = text.substring(0, 1000) + (text.length > 1000 ? '...' : '');
                        }
                    } catch (e) {
                        log.data = "[Unreadable Content]";
                    }
                }
                networkLogs.push(log);
            }
        });

        // 1. Go to the URL
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 2. Wait for the user-defined time 't'
        console.log(`Monitoring for ${waitTimeSec} seconds...`);
        await new Promise(r => setTimeout(r, waitTimeSec * 1000));

        await browser.close();
        res.json({ 
            success: true, 
            duration: `${waitTimeSec}s`,
            total_calls: networkLogs.length, 
            logs: networkLogs 
        });

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));
