const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 100;
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
    const waitTimeSec = Math.min(parseInt(req.query.t) || 20, 50);

    if (!targetUrl) return res.status(400).json({ error: "Missing url" });

    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome', // Path inside Docker
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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
                    try {
                        const text = await response.text();
                        log.data = text.substring(0, 500);
                    } catch { log.data = "[Error reading response]"; }
                }
                networkLogs.push(log);
            }
        });

        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await autoScroll(page);
        await new Promise(r => setTimeout(r, waitTimeSec * 1000));

        await browser.close();
        res.json({ success: true, logs: networkLogs });
    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));
