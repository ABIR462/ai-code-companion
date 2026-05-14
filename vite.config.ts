import { createRequire } from "module";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const require = createRequire(import.meta.url);
const supernovaImageHandler = require("./api/supernova-image.js");
const supernovaFileHandler = require("./api/supernova-file.js");

function readRequestBody(req: any) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      {
        name: "supernova-api-dev",
        configureServer(server) {
          server.middlewares.use("/api/supernova-image", async (req: any, res: any) => {
            try {
              req.body = await readRequestBody(req).then((body) => (body ? JSON.parse(body) : {}));

              const response = {
                statusCode: 200,
                setHeader: (key: string, value: string) => res.setHeader(key, value),
                status(code: number) {
                  this.statusCode = code;
                  return this;
                },
                json(payload: unknown) {
                  res.statusCode = this.statusCode;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(payload));
                },
              };

              await supernovaImageHandler(req, response);
            } catch (error: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: error?.message ?? "Supernova dev API failed" }));
            }
          });
          server.middlewares.use("/api/supernova-file", async (req: any, res: any) => {
            try {
              const response = {
                statusCode: 200,
                setHeader: (key: string, value: string) => res.setHeader(key, value),
                status(code: number) {
                  this.statusCode = code;
                  return this;
                },
                json(payload: unknown) {
                  res.statusCode = this.statusCode;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(payload));
                },
                end(payload: unknown) {
                  res.statusCode = this.statusCode;
                  res.end(payload);
                },
              };

              await supernovaFileHandler(req, response);
            } catch (error: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: error?.message ?? "Supernova file API failed" }));
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
