import { createRoot } from "react-dom/client";

import { ThemeProvider } from "@/app/providers/theme/ThemeProvider.jsx";
import App from "@/App.jsx";
import "@/index.css";
import "@fontsource/inter/400.css";

createRoot(document.getElementById("root")).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
