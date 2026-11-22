// Orchestrator owns this file. Mounts every module under /api.
import { Hono } from "hono";
import { logger } from "hono/logger";
import core from "./core";
import find from "./find";
import channels, { startChannels } from "./channels";
import review from "./review";
import lily from "./lily";
import "./lib/db";

const app = new Hono();
app.use(logger());
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", core);
app.route("/api", find);
app.route("/api", channels);
app.route("/api", review);
app.route("/api", lily);

startChannels();

export default { port: 4400, hostname: "127.0.0.1", fetch: app.fetch, idleTimeout: 255 };
