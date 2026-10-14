import puppeteer from "@cloudflare/puppeteer";
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/extract") {
      return new Response("Not Found. Use /extract?target=URL", { status: 404 });
    }
    const targetUrl = url.searchParams.get("target");
    if (!targetUrl) {
      return new Response("Missing 'target' parameter.", { status: 400 });
    }
    let browser;
    try {
      browser = await puppeteer.launch(env.MY_BROWSER);
      const page = await browser.newPage();
      let discoveredM3u8 = null;
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": new URL(targetUrl).origin
      });
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const reqUrl = req.url();
        if (reqUrl.includes(".m3u8")) {
          discoveredM3u8 = reqUrl;
        }
        req.continue();
      });
      await page.goto(targetUrl, { 
        waitUntil: "networkidle2", 
        timeout: 25000 
      });
      if (!discoveredM3u8) {
        discoveredM3u8 = await scanAllFramesRecursive(page.mainFrame());
      }
      await browser.close();
      if (discoveredM3u8) {
        return new Response(discoveredM3u8, {
          status: 200,
          headers: { 
            "Content-Type": "text/plain",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } else {
        return new Response("Stream asset not found.", { status: 404 });
      }
    } catch (err) {
      if (browser) await browser.close();
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }
};
async function scanAllFramesRecursive(frame) {
  try {
    const html = await frame.content();
    const regex = /(https?[:\/\w\.\-\?=&%~]+?\.m3u8[^\s"']*)/gi;
    const match = html.match(regex);
    if (match) return match[0].replace(/\\/g, '');
  } catch {
                             }
  for (const child of frame.childFrames()) {
    const stream = await scanAllFramesRecursive(child);
    if (stream) return stream;
  }
  return null;
        }        
