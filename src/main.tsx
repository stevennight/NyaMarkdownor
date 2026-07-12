import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { browserLanguages, createTranslator, resolveAppLocale, translateUiText } from "./lib/i18n";
import { loadPreferences } from "./lib/preferences";
import "./styles.css";

const startupLocale = resolveAppLocale(loadPreferences().language, browserLanguages());
const startupTranslator = createTranslator(startupLocale);

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Application render failed", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="startup-error" role="alert">
          <h1>{startupTranslator("NyaMarkdownor could not start")}</h1>
          <p>{this.state.error.message
            ? translateUiText(startupLocale, this.state.error.message)
            : startupTranslator("An unexpected rendering error occurred.")}</p>
          <button type="button" onClick={() => window.location.reload()}>{startupTranslator("Reload")}</button>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
