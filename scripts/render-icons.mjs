import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const sizes = [16, 32, 48, 128];
const sourcePath = resolve("icons/icon.svg");
const svg = await readFile(sourcePath, "utf8");
const sourceUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const browser = await chromium.launch({ headless: true });

try {
	for (const size of sizes) {
		const page = await browser.newPage({
			viewport: { width: size, height: size },
			deviceScaleFactor: 1,
		});
		await page.setContent(`
			<style>
				html, body { margin: 0; width: 100%; height: 100%; background: transparent; }
				img { display: block; width: 100%; height: 100%; }
			</style>
			<img src="${sourceUrl}" alt="" />
		`);
		await page.locator("img").evaluate((image) => image.decode());
		await page.screenshot({
			path: resolve(`icons/icon-${size}.png`),
			omitBackground: true,
		});
		await page.close();
	}
} finally {
	await browser.close();
}
