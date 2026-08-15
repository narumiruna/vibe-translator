import { useEffect, useState } from "react";

function getSystemTheme() {
	return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function useSystemTheme() {
	const [theme, setTheme] = useState(getSystemTheme);

	useEffect(() => {
		const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

		if (!query) {
			return undefined;
		}

		const handleChange = () => setTheme(query.matches ? "dark" : "light");

		query.addEventListener("change", handleChange);
		return () => query.removeEventListener("change", handleChange);
	}, []);

	return theme;
}

export { getSystemTheme, useSystemTheme };
export default useSystemTheme;
