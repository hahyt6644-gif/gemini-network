const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

// Optimized Scroll Function
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 200; // Faster scroll
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                // Stop after scrolling 3000px or reaching bottom to save time
                if (totalHeight >= scrollHeight || totalHeight > 3000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

app.get('/trace', async (req, res) => {
    const targetUrl = req.query.url;
    // Set wait time, default 15s (better for Render free tier)
    const waitTimeSec = Math.min(parseInt(req.query.t) || 15, 45);

    if (!targetUrl) return res.status(400).json({ error: "No URL" });

    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome',
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        const networkLogs = [];

        page.on('response', async (response) => {
            const request = response.request();
            if (['fetch', 'xhr'].includes(request.resourceType())) {
                const log = { url: response.url(), method: request.method(), status: response.status() };
                try {
                    log.data = await response.json();
                } catch {
                    log.data = "[Check manually]";
                }
                networkLogs.push(log);
            }
        });

        // FIX: Change waitUntil to 'domcontentloaded' to prevent 60s timeout
        await page.goto(targetUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 50000 // Stop slightly before Render's 60s limit
        });

        // Trigger lazy APIs manually
        await autoScroll(page);

        // Wait for the custom time
        await new Promise(r => setTimeout(r, waitTimeSec * 1000));

        await browser.close();
        res.json({ success: true, logs: networkLogs });

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: "Page took too long: " + err.message });
    }
});

app.listen(PORT, () => console.log(`API port ${PORT}`));
