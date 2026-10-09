/**
 * Shared Playwright/Chromium rendering for the PDF export routes.
 *
 * The headless browser runs on the SAME host as the app, so it renders the
 * internal /print page over the app's own local HTTP port — never the public
 * origin. Deriving the URL from the request (url.origin) can yield
 * `https://localhost:3000`, which has no TLS listener (the reverse proxy
 * terminates HTTPS and forwards plain HTTP), giving ERR_SSL_PROTOCOL_ERROR.
 * Override the base with PDF_RENDER_ORIGIN if the app isn't on 127.0.0.1:$PORT.
 */
import type { Browser } from "playwright";

/** Local origin the headless browser uses to reach this app (bypasses the TLS proxy). */
export function pdfRenderOrigin(): string {
  return process.env.PDF_RENDER_ORIGIN || `http://127.0.0.1:${process.env.PORT || "3000"}`;
}

export type PdfResult = { ok: true; pdf: Uint8Array<ArrayBuffer> } | { ok: false; status: number; error: string };

/**
 * Launch Chromium, print `printUrl` (an internal /print URL) to an A4-landscape
 * PDF, and return the bytes — or a typed error with a clear message (bad
 * browser path, missing system libs, navigation/render failure). Never throws.
 */
export async function renderPrintPdf(printUrl: string): Promise<PdfResult> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return { ok: false, status: 501, error: "PDF export requires the 'playwright' package on the server." };
  }

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  } catch (err) {
    const firstMsg = err instanceof Error ? err.message : "unknown error";
    const execPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    if (!execPath) {
      console.error("[export/pdf] chromium.launch failed:", firstMsg);
      return {
        ok: false,
        status: 500,
        error: `Could not launch Chromium for PDF export: ${firstMsg}. Install the browser (npx playwright install chromium) or set PLAYWRIGHT_CHROMIUM_PATH.`,
      };
    }
    try {
      browser = await chromium.launch({ headless: true, executablePath: execPath, args: ["--no-sandbox"] });
    } catch (err2) {
      const secondMsg = err2 instanceof Error ? err2.message : "unknown error";
      console.error("[export/pdf] chromium.launch(executablePath) failed:", secondMsg);
      return {
        ok: false,
        status: 500,
        error: `Could not launch Chromium at PLAYWRIGHT_CHROMIUM_PATH (${execPath}): ${secondMsg}. If it mentions a missing library, install Chromium's system dependencies: npx playwright install-deps chromium`,
      };
    }
  }

  try {
    const page = await browser.newPage();
    await page.goto(printUrl, { waitUntil: "networkidle", timeout: 60_000 });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
    });
    return { ok: true, pdf: new Uint8Array(pdf) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[export/pdf] render failed:", msg);
    return { ok: false, status: 500, error: `PDF render failed: ${msg}` };
  } finally {
    await browser.close();
  }
}
