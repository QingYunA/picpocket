import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

// Expose /plugins/index.json with local plugin files from public/plugins.
// The frontend can discover and list them when enabled; development reads the directory live, while builds emit a static registry.
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

export default defineConfig({
    base: process.env.VITE_PICPOCKET_EXTENSION === "1" ? "./" : process.env.VITE_BASE || "/",
    plugins: [react(), localPluginsManifest()],
    resolve: {
        // 画布会引用扩展 src 里的 React hook（@picpocket/hooks），必须与画布共用同一份 React，否则会出现两份 React 导致 hook 报错
        dedupe: ["react", "react-dom"],
        alias: {
            ...(process.env.VITE_PICPOCKET_EXTENSION === "1"
                ? {
                      "@/lib/analytics": resolve(webDir, "src/lib/analytics.extension.ts"),
                      "@/components/canvas/canvas-plugin-manager-modal": resolve(webDir, "src/components/canvas/canvas-plugin-manager-modal.extension.tsx"),
                      "@/lib/canvas/plugin-loader": resolve(webDir, "src/lib/canvas/plugin-loader.extension.ts"),
                      "@/services/api/image": resolve(webDir, "src/services/api/image.extension.ts"),
                      "@/services/api/model-plugin": resolve(webDir, "src/services/api/model-plugin.extension.ts"),
                  }
                : {}),
            "@": resolve(webDir, "src"),
            "@picpocket": resolve(webDir, "../../../src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
    build: process.env.VITE_PICPOCKET_EXTENSION === "1" ? {
        outDir: resolve(webDir, "../../../public/canvas"),
        emptyOutDir: true,
    } : undefined,
});
