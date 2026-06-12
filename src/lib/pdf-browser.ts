import { existsSync } from "node:fs";
import puppeteer, { type LaunchOptions } from "puppeteer";

function getEnvExecutablePath(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));

  return candidates[0];
}

function getSystemExecutablePath(): string | undefined {
  const candidates = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ];

  return candidates.find((path) => existsSync(path));
}

export async function getPdfBrowserLaunchOptions(): Promise<LaunchOptions> {
  const systemExecutablePath = getSystemExecutablePath();
  if (systemExecutablePath) {
    return {
      executablePath: systemExecutablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    };
  }

  const envExecutablePath = getEnvExecutablePath();

  if (envExecutablePath) {
    return {
      executablePath: envExecutablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    };
  }

  // Serverless Linux (e.g. AWS Lambda / Vercel): use the @sparticuz/chromium
  // binary. Loaded dynamically so it is never bundled or resolved on local
  // Windows/Mac builds, where Puppeteer's own Chromium is used instead.
  if (process.platform === "linux") {
    const { default: chromium } = await import("@sparticuz/chromium");
    return {
      executablePath: await chromium.executablePath(),
      headless: true,
      args: [...chromium.args, "--disable-dev-shm-usage"],
    };
  }

  // Local dev (Windows/Mac): use the Chromium that Puppeteer downloaded.
  return {
    executablePath: await puppeteer.executablePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };
}
