import { createRoot } from "react-dom/client";

import "@radix-ui/themes/tokens.css";
import "@radix-ui/themes/components.css";
import { OptionsApp } from "./app.jsx";
import "./styles.css";

const container = document.getElementById("options-root");

if (!container) {
	throw new Error("Options root is unavailable.");
}

createRoot(container).render(<OptionsApp />);
