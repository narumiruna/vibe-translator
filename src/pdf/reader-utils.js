function decodeLaunchToken(hash) {
	try {
		return hash ? decodeURIComponent(String(hash).replace(/^#/u, "")) : "";
	} catch (_error) {
		return "";
	}
}

function hashText(text) {
	let hash = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function renderSearchText(element, text, query, documentNode = document) {
	element.replaceChildren();
	if (!query) {
		element.textContent = text;
		return;
	}
	const lowerText = text.toLocaleLowerCase();
	const lowerQuery = query.toLocaleLowerCase();
	let offset = 0;
	let index = lowerText.indexOf(lowerQuery);
	while (index >= 0) {
		element.append(documentNode.createTextNode(text.slice(offset, index)));
		const mark = documentNode.createElement("mark");
		mark.textContent = text.slice(index, index + query.length);
		element.append(mark);
		offset = index + query.length;
		index = lowerText.indexOf(lowerQuery, offset);
	}
	element.append(documentNode.createTextNode(text.slice(offset)));
}

function sanitizeDocumentId(value, randomUUID = () => crypto.randomUUID()) {
	const normalized = String(value || "")
		.replace(/[^A-Za-z0-9_-]/gu, "")
		.slice(0, 32);
	return `d${normalized || randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export { decodeLaunchToken, hashText, renderSearchText, sanitizeDocumentId };
