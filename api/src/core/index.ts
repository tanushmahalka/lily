// Thread A owns this folder. Frozen exports: setStage, postChat, createApproval (see CONTRACT.md).
import { Hono } from "hono";
import chat from "./chat";
import routes from "./routes";

export { setStage, type Stage } from "./stage";
export { postChat } from "./chat";
export { createApproval } from "./approvals";

const app = new Hono();
app.route("/", chat);
app.route("/", routes);
export default app;
