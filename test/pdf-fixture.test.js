import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
	analyzePdfPage,
	removeRepeatedFurniture,
} from "../src/pdf/extraction.js";

const fixtureUrl = new URL("./fixtures/pdf/two-column.pdf", import.meta.url);
const encryptedUrl = new URL("./fixtures/pdf/encrypted.pdf", import.meta.url);

async function loadPdf(fileUrl, password) {
	const { VerbosityLevel, getDocument } = await import(
		"pdfjs-dist/legacy/build/pdf.mjs"
	);
	const task = getDocument({
		verbosity: VerbosityLevel.ERRORS,
		data: new Uint8Array(await readFile(fileUrl)),
		isEvalSupported: false,
		standardFontDataUrl: new URL(
			"../node_modules/pdfjs-dist/standard_fonts/",
			import.meta.url,
		).toString(),
	});
	if (password) {
		task.onPassword = (updatePassword) => updatePassword(password);
	}
	return { document: await task.promise, task };
}

test("project PDF fixture exposes three text pages in column order", async () => {
	const { document, task } = await loadPdf(fixtureUrl);
	try {
		assert.equal(document.numPages, 3);
		const pages = [];
		for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
			const page = await document.getPage(pageNumber);
			const viewport = page.getViewport({ scale: 1 });
			const textContent = await page.getTextContent();
			pages.push({
				blocks: analyzePdfPage({
					documentId: "fixture",
					items: textContent.items,
					pageNumber,
					pageWidth: viewport.width,
				}),
				height: viewport.height,
				pageNumber,
			});
		}
		const filtered = removeRepeatedFurniture(pages);
		const firstPage = filtered[0].blocks.map((block) => block.text).join(" ");
		assert.match(firstPage, /Computational thinking/);
		assert.match(firstPage, /computational should be joined/);
		assert.ok(
			firstPage.indexOf("Computational thinking") <
				firstPage.indexOf("The right column"),
		);
		assert.equal(firstPage.includes("Repeated footer"), false);
		assert.equal(
			filtered[0].blocks.some(
				(block) => block.originalOnly && /formula/.test(block.text),
			),
			true,
		);
	} finally {
		await task.destroy();
	}
});

test("encrypted PDF fixture opens only with the documented test password", async () => {
	const { document, task } = await loadPdf(encryptedUrl, "vibe-test");
	try {
		assert.equal(document.numPages, 3);
		const page = await document.getPage(1);
		const text = (await page.getTextContent()).items
			.map((item) => item.str)
			.join(" ");
		assert.match(text, /Vibe Translator PDF Fixture/);
	} finally {
		await task.destroy();
	}
});
