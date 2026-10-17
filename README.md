# AI Confessions Bingo 🎉

A playful, mobile-friendly bingo game for an in-person or remote UX off-site. One facilitator calls random “Never have I ever…” statements. Players answer **yes** or **no** by tapping. A yes marks the square when it appears on their card. The host screen shows live totals and announces bingo winners.

This is a **self-hosted Railway edition** of the app. It uses PostgreSQL instead of the original Cloudflare D1 database. It starts with **fresh cards, confessions, calls, and winners**; it does not import data from the existing ChatGPT Site.

## What you need

- A GitHub repository containing this folder's files at its root
- A Railway project with this repository as a service
- A Railway PostgreSQL service
- A private caller passphrase of at least 8 characters

## Deploy from GitHub to Railway

1. Create a new GitHub repository and upload **the contents of this folder**. Do not upload `node_modules`, `.next`, or `.env`.
2. In Railway, create a project and choose **Deploy from GitHub repo**. Select the repository. Railway will detect the included `Dockerfile`.
3. In the same Railway project, add **Database → PostgreSQL**.
4. Open the app service's **Variables** tab. Add a reference variable named `DATABASE_URL` pointing to the PostgreSQL service's `DATABASE_URL`.
5. Add `CALLER_PIN` to the app service's variables. Use a private passphrase of at least 8 characters. Share it only with the facilitator. Do not put it in GitHub.
6. Redeploy the app service after setting those variables. The container creates its database tables on startup.
7. Under the app service's **Settings → Networking**, choose **Generate Domain**. Open that URL for players. Add `/caller` to the URL for the host display.
8. Optionally configure the app service's healthcheck path as `/api/health`.

The PostgreSQL service should stay private to the Railway project. The app needs no public database URL.

## Run the game

1. Open `/caller` on the host screen and enter `CALLER_PIN`.
2. Share the player URL displayed there with everyone, including remote participants.
3. Press **Call the first one**, read the statement aloud, and let people answer. Press **Next confession** when ready.
4. Players tap **Yes, me!** or **Not me**. The player screen shows this round's yes/no results.
5. A player with bingo can enter a name or nickname. Each distinct completed row, column, or diagonal can be announced once. Every announcement appears on the host screen so they can claim a prize. Individual answers remain visible only as team totals.
6. To play again, the caller presses **Start a new game for everyone** and confirms. All open player tabs receive fresh cards within a few seconds; answers, calls, and winner announcements are cleared.

The caller PIN is kept in that browser tab's session storage after the first successful call. Attendees do not need the PIN to play.

## Local development

Requires Node.js 20.9+ and PostgreSQL.

```sh
npm ci
cp .env.example .env.local
# Edit .env.local with your local DATABASE_URL and CALLER_PIN.
npm run db:migrate
npm run dev
```

Open `http://localhost:3000` for players and `http://localhost:3000/caller` for the facilitator. To check the production build, run `npm run build`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for shared game data |
| `CALLER_PIN` | Host-only passphrase for advancing calls; minimum 8 characters |
| `PORT` | Provided by Railway; defaults to 3000 locally |

The Docker image runs its idempotent schema setup when it starts, then starts Next.js. It can be deployed again without clearing game data. A caller can run through all 30 prompts per game, then start a fresh game from the caller screen.

## Privacy and access

Players have random IDs stored on their own device. The database stores those IDs with yes/no answers and checked confessions; it does not collect email addresses or microphone recordings. Team totals are shown publicly to anyone who can open the app. A winner's name or nickname is displayed only after they choose to announce it.

This edition does not include player sign-in. Anyone with the public player URL can participate. Keep `CALLER_PIN` private so only the facilitator can advance the prompts.
