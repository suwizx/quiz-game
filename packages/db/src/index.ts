import { env } from "@singpore-game/env/server";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/** ชนิดของ db ที่ตั้งชื่อได้ — กัน TS2883 ตอนแพ็กเกจอื่น re-export ตัว instance */
export type Db = NodePgDatabase<typeof schema>;

/**
 * default ของ node-postgres คือ max 10 ซึ่งน้อยเกินไปเมื่อผู้เล่นหลักร้อยคน
 * ตอบพร้อมกัน — ปรับได้ด้วย DATABASE_POOL_MAX โดยไม่ต้อง build ใหม่
 */
const POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? 20);

export function createDb(): Db {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: POOL_MAX,
    /**
     * ห้ามรอ connection แบบไม่มีกำหนด — ค่า default (0 = รอตลอดกาล) ทำให้ pool
     * ที่ตันกลายเป็นเซิร์ฟค้างเงียบ ๆ ที่กู้เองไม่ได้ ยอมให้ request พังดังกว่า
     */
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  pool.on("error", (error) => {
    console.error("[db] pool error", error);
  });

  return drizzle({ client: pool, schema });
}

export const db = createDb();
