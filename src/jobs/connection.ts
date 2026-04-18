import { Redis } from "ioredis";
import { config } from "../config.js";

// BullMQ requires `maxRetriesPerRequest: null` on connections used for
// blocking commands (Worker, QueueEvents). A single shared connection
// is fine; BullMQ multiplexes internally.
export function createRedisConnection(): Redis {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}
