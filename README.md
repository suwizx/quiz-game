# ปริศนาฟ้าแลบ (singpore-game)

เกมควิซ 4 ตัวเลือกที่เล่นพร้อมกันทั้งห้องแบบเรียลไทม์ แข่งกัน **สะสม streak** ให้ยาวที่สุดในเวลาที่ผู้ดูแลกำหนด

## กติกา

- ตอบถูก streak +1 · ตอบผิด streak กลับเป็น 0
- หลอดน้ำเต็มที่ 10 แต่ตัวเลข streak วิ่งต่อได้ไม่จำกัด (หลอดคงเต็มไว้)
- จัดอันดับ: **streak สูงสุดของรอบ** → จำนวนข้อถูก → เวลาที่ใช้ตอบรวม (น้อยกว่าดีกว่า)
- แต่ละคนได้ลำดับคำถามสุ่มของตัวเอง กดตอบเดินหน้าเองไม่ต้องรอเพื่อน หมดพูลแล้วสับใหม่วนต่อ
- Refresh หรือเน็ตหลุดแล้วกลับมาเล่นต่อได้ที่คำถามข้อเดิม โดยนาฬิกาข้อนั้นไม่รีเซ็ต

## สถาปัตยกรรมโดยย่อ

- **Server เป็นเจ้าของสถานะทั้งหมด** — เฉลยไม่เคยถูกส่งไปที่ client ก่อนตอบ และการให้คะแนนทำที่ server เท่านั้น
- **WebSocket** (`/ws/game`) ส่ง tick, กระดานคะแนน และเหตุการณ์แซงอันดับ · ต่อด้วย **ตั๋วอายุ 30 วินาที** จาก `POST /api/game/ws-ticket` แทนการพึ่ง cookie ตอน handshake
- **heartbeat ทุก 25 วินาที** ในทุกสถานะเกม เพื่อกัน Cloudflare Tunnel ตัด connection ที่เงียบเกิน 125 วินาที
- กติกาเกมล้วน ๆ อยู่ใน `packages/game-core` (ทดสอบด้วย `bun test`) ใช้ร่วมกันทั้ง server และ web
- Hub เก็บ connection ไว้ใน memory → รันได้ **process เดียว** เท่านั้น (พอสำหรับห้องเรียน ~50 คน)

## การเข้าสู่ระบบ

เข้าได้เฉพาะอีเมล `@kmitl.ac.th` (ตั้งค่าได้ที่ `ALLOWED_EMAIL_DOMAIN`) หรืออีเมลของผู้ดูแล
การกรองทำที่ `databaseHooks` ของ Better Auth สองชั้น (ตอนสร้างบัญชี และตอนสร้าง session)

ผู้ดูแลมีสองแบบ:

- **ผู้ดูแลหลัก** — อีเมลใน `ADMIN_EMAILS` (env) ถอดสิทธิ์ผ่านหน้าเว็บไม่ได้ ใช้เป็นตัวตั้งต้น
- **ผู้ดูแลที่เพิ่มทีหลัง** — เพิ่ม/ถอดได้ที่แท็บ "ผู้ดูแล" ในแผงควบคุม เก็บในตาราง `admin_user`
  เพิ่มไว้ล่วงหน้าได้แม้เจ้าตัวยังไม่เคยล็อกอิน และข้ามข้อจำกัดโดเมนได้เหมือนผู้ดูแลหลัก

สิทธิ์ถูกเช็คใหม่ทุก request จากฐานข้อมูล การถอดสิทธิ์จึงมีผลทันทีโดยไม่ต้องรอ session หมดอายุ

> หมายเหตุ: ไม่ได้ใช้ตัวเลือก `hd` ของ Google เพราะมันบังคับให้ทุกบัญชีอยู่ใน Workspace เดียวกัน
> ซึ่งจะทำให้อีเมลผู้ดูแลที่เป็น Gmail ส่วนตัวเข้าไม่ได้

ตั้งค่า Google OAuth ที่ [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

```bash
# apps/server/.env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ADMIN_EMAILS=suwijak.pak@gmail.com
```

Authorized redirect URI คือ `<BETTER_AUTH_URL>/api/auth/callback/google`

ระหว่างที่ยังไม่มี credential ตั้ง `DEV_LOGIN=true` เพื่อเปิดฟอร์มอีเมล/รหัสผ่านสำหรับทดสอบ
(ปิดอัตโนมัติเมื่อ `NODE_ENV=production` และยังถูกจำกัดโดเมนเหมือนกัน)

## Stack

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Elysia** - Type-safe, high-performance framework
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **PWA** - Progressive Web App support
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema and seed the roster + question bank:

```bash
bun run db:start   # postgres ผ่าน docker compose
bun run db:push
bun run db:seed    # docs/IPA 2026 Sheet1.csv → roster, docs/questions.json → คลังคำถาม
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@singpore-game/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Deployment

### Mac + Cloudflare Tunnel

WebSocket ผ่าน Cloudflare Tunnel ใช้ได้ทุกแพ็กเกจรวมฟรี แต่ต้องระวังสามเรื่อง

**1. ใช้ hostname เดียวแล้วแยกด้วย path** → same-origin ทำให้ไม่มี CORS และใช้ cookie `sameSite: "lax"` ได้

```yaml
# ~/.cloudflared/config.yml
tunnel: singpore-game
credentials-file: ~/.cloudflared/<id>.json
protocol: http2 # QUIC (ค่าเริ่มต้น) ทำให้ WS หลุดบ่อยเมื่อ NAT ตัด UDP idle เร็ว
ingress:
  - hostname: game.example.com
    path: ^/(api|ws)/
    service: http://localhost:3000
  - hostname: game.example.com
    service: http://localhost:3001
  - service: http_status:404
```

**2. อย่าครอบ Cloudflare Access ทับ `/ws/*`** — WebSocket handshake ผ่าน Access ไม่ได้ถ้าไม่ใช้ service token

**3. Mac ต้องไม่หลับ** — `caffeinate -dimsu` หรือปิด sleep ใน Energy Saver

ตั้ง `BETTER_AUTH_URL` / `CORS_ORIGIN` / `VITE_SERVER_URL` เป็น `https://game.example.com` และเพิ่ม redirect URI นี้ใน Google OAuth console ด้วย

ก่อนวันใช้งานจริง ให้เปิดหน้าเตรียมตัวทิ้งไว้ 3 นาทีโดยไม่แตะ — ถ้า WS ไม่หลุดแปลว่า heartbeat ทำงานถูกต้อง

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: bun run docker:build
- Start: bun run docker:up
- Logs: bun run docker:logs
- Stop: bun run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

For more details, see the guide on [Deploying with Docker Compose](https://www.better-t-stack.dev/docs/guides/docker).

## Project Structure

```
singpore-game/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Elysia)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── auth/        # Authentication configuration & logic
│   ├── game-core/   # กติกาเกม (streak, จัดอันดับ, คิวคำถาม) + type ของ WS event
│   └── db/          # Database schema & queries
└── docs/
    ├── IPA 2026 Sheet1.csv  # รายชื่อนักศึกษา ใช้ตั้งชื่อเล่นตั้งต้น
    └── questions.json       # คลังคำถามตั้งต้น
```

### เส้นทางหลัก

| ที่อยู่          | หน้าที่                                                        |
| ---------------- | -------------------------------------------------------------- |
| `/login`         | เข้าสู่ระบบด้วย Google                                         |
| `/prepare`       | แก้ชื่อที่จะแสดง ดูจำนวนผู้เล่น รอนับถอยหลัง 3-2-1              |
| `/play`          | หน้าเล่น — หลอด streak, คำถาม, แถบแจ้งเตือนการแซงอันดับ         |
| `/scoreboard`    | กระดานคะแนนเรียลไทม์ (เข้าดูระหว่างเล่นได้)                    |
| `/summary`       | สรุปหลังจบเกม                                                  |
| `/admin`         | แผงผู้ดูแล — แท็บกำลังเล่น และแท็บคำถาม                        |

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run test`: Run unit tests (กติกาเกมใน `packages/game-core`)
- `bun run db:push`: Push schema changes to database
- `bun run db:seed`: Seed roster + question bank from `docs/`
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `cd apps/web && bun run generate-pwa-assets`: Generate PWA assets
- `bun run docker:build`: Build the Docker Compose images
- `bun run docker:up`: Build and start the Docker Compose stack
- `bun run docker:logs`: Tail logs from the Docker Compose stack
- `bun run docker:down`: Stop the Docker Compose stack
