import puppeteer from "puppeteer";
import { getPdfBrowserLaunchOptions } from "@/lib/pdf-browser";

export async function generateQuotePdf(targetUrl: string): Promise<Buffer> {
  let browser;

  try {
    browser = await puppeteer.launch(await getPdfBrowserLaunchOptions());

    const page = await browser.newPage();

    await page.goto(targetUrl, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    await page.evaluate(() => {
      const root = document.documentElement;
      root.classList.remove("dark");
      root.style.colorScheme = "light";

      document.body?.classList.remove("dark");
      if (document.body) {
        document.body.style.colorScheme = "light";
      }

      try {
        window.localStorage.setItem("theme", "light");
      } catch {
        // Ignore storage access failures in headless environments.
      }
    });

    await page.emulateMediaType("print");

    await page.addStyleTag({
      content: `
    @page {
      size: A4;
      margin: 4mm;
    }

    html {
      zoom: 1.15;
    }
  `,
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "5mm",
        bottom: "5mm",
        left: "5mm",
        right: "5mm",
      },
    });

    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close();
  }
}
