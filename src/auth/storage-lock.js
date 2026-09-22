const writeTails = new Map();

function defaultLockManager() {
	return typeof navigator === "undefined" ? undefined : navigator.locks;
}

function withExclusiveStorageWrite(
	name,
	operation,
	locks = defaultLockManager(),
) {
	const previous = writeTails.get(name) || Promise.resolve();
	const result = previous
		.catch(() => undefined)
		.then(() =>
			locks
				? locks.request(name, { mode: "exclusive" }, operation)
				: operation(),
		);
	const settled = result.then(
		() => undefined,
		() => undefined,
	);

	writeTails.set(name, settled);
	void settled.finally(() => {
		if (writeTails.get(name) === settled) {
			writeTails.delete(name);
		}
	});

	return result;
}

export { withExclusiveStorageWrite };
