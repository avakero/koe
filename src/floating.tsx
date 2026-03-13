import React from "react";
import ReactDOM from "react-dom/client";
import FloatingWindow from "./components/FloatingWindow";
import { ThemeProvider } from "./lib/ThemeContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <ThemeProvider>
            <FloatingWindow />
        </ThemeProvider>
    </React.StrictMode>
);
