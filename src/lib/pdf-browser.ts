import { existsSync } from "node:fs";
import { type LaunchOptions } from "puppeteer";
import chromium from "@sparticuz/chromium";

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

  if (process.platform === "linux") {
    return {
      executablePath: await chromium.executablePath(),
      headless: true,
      args: [...chromium.args, "--disable-dev-shm-usage"],
    };
  }

  return {
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, "--disable-dev-shm-usage"],
  };
}
