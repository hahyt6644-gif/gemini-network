const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

// Function to scroll the page to trigger lazy-loaded APIs
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 100; // Scroll 100px at a time
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

app.get('/trace', async (req, res) => {
    const targetUrl = req.query.url;
    // Default wait 20s, custom via &t=, max 50s
    const waitTimeSec = Math.min(parseInt(req.query.t) || 20, 50);

    if (!targetUrl) return res.status(400).json({ error: "Missing url parameter" });

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        const networkLogs = [];

        // Capture Network Data
        page.on('response', async (response) => {
            const request = response.request();
            if (['fetch', 'xhr'].includes(request.resourceType())) {
                const log = {
                    url: response.url(),
                    method: request.method(),
                    status: response.status(),
                    type: request.resourceType()
                };

                try {
                    // Try to get JSON first
                    log.data = await response.json();
                } catch {
                    try {
                        // Fallback to text (trimmed)
                        const text = await response.text();
                        log.data = text.substring(0, 1000);
                    } catch {
                        log.data = "[Binary Data]";
                    }
                }
                networkLogs.push(log);
            }
        });

        // 1. Load the Page
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // 2. Auto-Scroll to bottom
        await autoScroll(page);

        // 3. Wait the requested time 't'
        await new Promise(r => setTimeout(r, waitTimeSec * 1000));

        await browser.close();
        res.json({ success: true, logs: networkLogs });

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => console.log(`API Active`));
