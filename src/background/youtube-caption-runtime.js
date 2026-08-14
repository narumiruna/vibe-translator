import { resolveNativeYoutubeCaptionRequestUrl } from "./youtube-caption-tracks.js";

const TRACKER_KEY = "__otCaptionRequestTracker";

async function captureNativeYoutubeCaptionRequestUrl(
	chrome,
	tabId,
	advertisedUrl,
) {
	let advertised = null;

	try {
		advertised = new URL(String(advertisedUrl || ""));
	} catch (_error) {
		return "";
	}

	const expected = Object.fromEntries(
		["v", "lang", "kind", "variant"].map((name) => [
			name,
			advertised.searchParams.get(name) || "",
		]),
	);
	const [result] = await chrome.scripting.executeScript({
		target: { tabId },
		world: "MAIN",
		args: [expected, TRACKER_KEY],
		func: async (match, trackerKey) => {
			const collect = () => {
				const trackedUrls = Array.isArray(globalThis[trackerKey]?.urls)
					? globalThis[trackerKey].urls
					: [];

				return [
					...trackedUrls,
					...performance
						.getEntriesByType("resource")
						.map((entry) => entry.name),
				]
					.flatMap((entryName) => {
						try {
							const url = new URL(entryName);
							const hostname = url.hostname.toLowerCase();

							if (
								url.protocol !== "https:" ||
								(hostname !== "youtube.com" &&
									!hostname.endsWith(".youtube.com")) ||
								url.pathname !== "/api/timedtext" ||
								Object.entries(match).some(
									([name, value]) =>
										value && url.searchParams.get(name) !== value,
								)
							) {
								return [];
							}

							return [url.toString()];
						} catch (_error) {
							return [];
						}
					})
					.slice(-8);
			};
			const deadline = Date.now() + 1200;
			let urls = collect();

			while (urls.length === 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				urls = collect();
			}

			return urls;
		},
	});

	return resolveNativeYoutubeCaptionRequestUrl(
		result?.result,
		advertised.toString(),
	);
}

const api = { captureNativeYoutubeCaptionRequestUrl, TRACKER_KEY };

export { captureNativeYoutubeCaptionRequestUrl, TRACKER_KEY };
export default api;
