import type { Logger } from "pino";
import type { Tx } from "../db/index.js";
import type { Tenant } from "../db/schema.js";

export interface AppVariables {
  correlationId: string;
  logger: Logger;
  tenant: Tenant;
  tx: Tx;
  body: unknown; // set by parseJsonBody middleware on mutating routes
}

export interface AppEnv {
  Variables: AppVariables;
}
