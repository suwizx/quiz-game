import { env } from "@singpore-game/env/server";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

/** ชนิดของ db ที่ตั้งชื่อได้ — กัน TS2883 ตอนแพ็กเกจอื่น re-export ตัว instance */
export type Db = NodePgDatabase<typeof schema>;

export function createDb(): Db {
  return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
