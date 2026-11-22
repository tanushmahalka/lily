import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "./kit/halaska-kit";
import { ToastHost } from "./lib/toast";
import App from "./App";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ThemeProvider theme="light">
        <MotionConfig reducedMotion="user">
          <ToastHost>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ToastHost>
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
