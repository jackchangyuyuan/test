import { createServer } from "node:http";

import { app } from "./app.ts";
import { env } from "./env.ts";
import { createRealtimeServer } from "./realtime.ts";

const httpServer = createServer(app);
createRealtimeServer(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`API listening on port ${String(env.PORT)}`);
});
