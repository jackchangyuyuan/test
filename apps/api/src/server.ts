import { app } from "./app.ts";
import { env } from "./env.ts";

app.listen(env.PORT, () => {
  console.log(`API listening on port ${String(env.PORT)}`);
});
