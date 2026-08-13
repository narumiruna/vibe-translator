/** @type {import("extension").FileConfig} */
const config = {
	browser: {
		chrome: {
			persistProfile: true,
			profile: "./dist/extension-profile-chrome",
		},
		firefox: {
			profile: "./dist/extension-profile-firefox",
		},
	},
	commands: {
		dev: {
			logColor: true,
			logContexts: ["background", "content", "options", "page"],
			logLevel: "info",
			logTimestamps: true,
		},
	},
};

export default config;
