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

    await page.addStyleTag({
      content: `
    @page {
      size: A4;
      margin: 6mm;
    }

    html {
      zoom: 0.90;
    }
  `,
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "8mm",
        bottom: "8mm",
        left: "8mm",
        right: "8mm",
      },
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close();
  }
}