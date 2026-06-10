import puppeteer from "puppeteer";

export async function generateQuotePdf(targetUrl: string): Promise<Buffer> {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.goto(targetUrl, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "15mm",
        bottom: "15mm",
        left: "10mm",
        right: "10mm",
      },
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close();
  }
}