import Messages from "../shared/messages.js";
import Settings from "../shared/settings.js";

function createOptionsApi(options = {}) {
	const chromeApi = options.chrome || globalThis.chrome;
	const messagesApi = options.messagesApi || Messages;
	const settingsApi = options.settingsApi || Settings;

	async function getPermissionStatus(baseUrl) {
		try {
			const originPattern = settingsApi.getApiPermissionPattern(baseUrl);
			const granted = await chromeApi.permissions.contains({
				origins: [originPattern],
			});

			return {
				granted,
				message: granted
					? `Granted for ${originPattern}`
					: `Not granted for ${originPattern}`,
				originPattern,
				status: granted ? "granted" : "missing",
			};
		} catch (_error) {
			return {
				granted: false,
				message: "Base URL is invalid.",
				originPattern: "",
				status: "invalid",
			};
		}
	}

	async function requestPermission(baseUrl) {
		const originPattern = settingsApi.getApiPermissionPattern(baseUrl);
		const permission = { origins: [originPattern] };

		if (await chromeApi.permissions.contains(permission)) {
			return true;
		}

		return chromeApi.permissions.request(permission);
	}

	async function testConnection(settings) {
		return chromeApi.runtime.sendMessage(
			messagesApi.createMessage(
				messagesApi.MESSAGE_TYPES.TEST_CONNECTION,
				settings,
			),
		);
	}

	return { getPermissionStatus, requestPermission, testConnection };
}

const api = { createOptionsApi };

export { createOptionsApi };
export default api;
