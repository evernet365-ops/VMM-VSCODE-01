import { Pool } from "pg";
import { getEnv, getNumberEnv } from "./config.js";

let sharedPool: Pool | undefined;

export function getDbPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString: getEnv("DATABASE_URL", "postgres://evernet:evernet@localhost:5432/evernet_vmm"),
      max: getNumberEnv("DB_POOL_MAX", 20)
    });
  }
  return sharedPool;
}

export async function closeDbPool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.end();
    sharedPool = undefined;
  }
}
