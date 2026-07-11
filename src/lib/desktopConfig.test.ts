import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import tauriDevConfig from "../../src-tauri/tauri.dev.conf.json";
import tauriConfig from "../../src-tauri/tauri.conf.json";
import viteConfig from "../../vite.config";

describe("desktop development configuration", () => {
  it("keeps Vite and Tauri dev URLs on the same strict local port", () => {
    const vitePort = viteConfig.server?.port;
    const webDevScript = packageJson.scripts["web:dev"];
    const scriptPort = webDevScript.match(/--port\s+(\d+)/)?.[1];

    expect(vitePort).toBeGreaterThan(0);
    expect(viteConfig.server?.host).toBe("127.0.0.1");
    expect(viteConfig.server?.strictPort).toBe(true);
    expect(tauriConfig.build.devUrl).toBe(`http://127.0.0.1:${vitePort}`);
    expect(packageJson.scripts.dev).toBe("tauri dev --config src-tauri/tauri.dev.conf.json");
    expect(packageJson.scripts["desktop:dev"]).toBe(packageJson.scripts.dev);
    expect(tauriConfig.build.beforeDevCommand).toBe("npm run web:dev");
    expect(webDevScript).toContain("vite");
    if (scriptPort) expect(Number(scriptPort)).toBe(vitePort);
  });

  it("isolates the development app from an installed release instance", () => {
    expect(tauriDevConfig.identifier).not.toBe(tauriConfig.identifier);
    expect(tauriDevConfig.productName).toContain("Dev");
    expect(tauriDevConfig.app.windows[0]?.minWidth).toBe(tauriConfig.app.windows[0]?.minWidth);
    expect(tauriDevConfig.app.windows[0]?.minHeight).toBe(tauriConfig.app.windows[0]?.minHeight);
  });

  it("declares every supported Markdown extension for packaged file associations", () => {
    const markdownAssociation = tauriConfig.bundle.fileAssociations.find((association) => association.mimeType === "text/markdown");

    expect(markdownAssociation?.ext).toEqual(["md", "markdown", "mdown", "mkdn", "mdwn"]);
    expect(tauriConfig.bundle.fileAssociations.find((association) => association.mimeType === "text/plain")?.ext).toEqual(["txt"]);
  });

  it("keeps the desktop window small enough to exercise the compact layout", () => {
    const mainWindow = tauriConfig.app.windows[0];

    expect(mainWindow?.minWidth).toBeLessThanOrEqual(450);
    expect(mainWindow?.minHeight).toBeLessThanOrEqual(480);
  });
});
