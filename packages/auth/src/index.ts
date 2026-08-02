import { createDb } from "@singpore-game/db";
import { isAllowedEmail } from "@singpore-game/db/admins";
import * as schema from "@singpore-game/db/schema/auth";
import { env, isDevLoginEnabled, isGoogleAuthConfigured } from "@singpore-game/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

const DOMAIN_ERROR = `เข้าสู่ระบบได้เฉพาะอีเมล @${env.ALLOWED_EMAIL_DOMAIN} เท่านั้น`;

async function assertAllowedEmail(email: string) {
  // เช็คกับตาราง admin_user ด้วย เพื่อให้ผู้ดูแลที่ถูกเพิ่มทีหลัง (นอกโดเมน) เข้าได้
  if (!(await isAllowedEmail(email))) {
    throw new APIError("FORBIDDEN", { message: DOMAIN_ERROR });
  }
}

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    // ปกติปิด — เปิดได้เฉพาะตอน dev ผ่าน DEV_LOGIN เพื่อทดสอบก่อน Google พร้อม
    emailAndPassword: {
      enabled: isDevLoginEnabled,
    },
    socialProviders: isGoogleAuthConfigured
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID as string,
            clientSecret: env.GOOGLE_CLIENT_SECRET as string,
            // ไม่ใช้ตัวเลือก `hd` ของ Google เพราะมันบังคับทุกบัญชีให้อยู่ใน
            // Workspace เดียว ทำให้อีเมล admin ที่เป็น gmail ส่วนตัวเข้าไม่ได้
            // จึงกรองโดเมนเองใน databaseHooks ด้านล่างแทน (ยกเว้น ADMIN_EMAILS ได้)
          },
        }
      : undefined,
    databaseHooks: {
      // กันคนนอกโดเมนตั้งแต่ตอนสร้างบัญชีครั้งแรก
      user: {
        create: {
          before: async (user) => {
            await assertAllowedEmail(user.email);
            return { data: user };
          },
        },
      },
      // และกันอีกชั้นตอนเข้าสู่ระบบ เผื่อบัญชีถูกสร้างไว้ก่อนที่กติกาจะเปลี่ยน
      session: {
        create: {
          before: async (session) => {
            const account = await db.query.user.findFirst({
              where: (table, { eq }) => eq(table.id, session.userId),
              columns: { email: true },
            });
            await assertAllowedEmail(account?.email ?? "");
            return { data: session };
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export const auth = createAuth();

export type Session = typeof auth.$Infer.Session;
