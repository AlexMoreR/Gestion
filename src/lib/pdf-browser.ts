import puppeteer, { type LaunchOptions } from "puppeteer";
import chromium from "@sparticuz/chromium";

function getEnvExecutablePath(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));

  return candidates[0];
}

export async function getPdfBrowserLaunchOptions(): Promise<LaunchOptions> {
  const envExecutablePath = getEnvExecutablePath();

  if (envExecutablePath) {
    return {
      executablePath: envExecutablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };
  }

  if (process.platform === "linux") {
    return {
      executablePath: await chromium.executablePath(),
      headless: true,
      args: chromium.args,
    };
  }

  return {
    executablePath: await puppeteer.executablePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
}
