# Finance Dashboard

A full-stack personal finance app with a React + Vite frontend and an Express + SQLite backend. It includes dashboards, account tracking, income and expense management, subscriptions, budget goals, CSV import, settings, and an optional Gemini-powered AI advisor.

## Stack

- Frontend: React 19 + Vite
- Backend: Node.js + Express
- Database: SQLite via `sql.js`
- AI: Google Gemini API (optional)

## Prerequisites

- Node.js 20+ recommended
- npm 10+ recommended

Tested in this workspace with:

- Node.js `v24.14.1`
- npm `11.11.0`

## Installation

From the project root:

```bash
npm run install:all
```

That command installs:

- the root dependencies used by the API and the combined dev workflow
- the frontend dependencies inside [`client`](./client)

## Environment Setup

Create a `.env` file in the project root:

```env
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
```

Notes:

- `PORT` is optional. If omitted, the API defaults to `3001`.
- `GEMINI_API_KEY` is optional. The app still runs without it, but the AI Advisor features will be unavailable.
- The backend loads `.env` from the project root, not from the `client` or `server` folders.

To get a Gemini key, create one in [Google AI Studio](https://aistudio.google.com/app/apikey).

## Running The App

Start the full app from the project root:

```bash
npm run dev
```

This starts:

- the API on `http://localhost:3001`
- the frontend on `http://localhost:5173`

Then open:

```text
http://localhost:5173
```

The frontend talks to the backend through Vite's `/api` proxy.

## Windows Control Panel

If you are on Windows, you can now use the launcher in the project root:

```bat
finai-panel.bat
```

What it does:

- creates `.env` automatically from `.env.example` on first run
- installs missing dependencies automatically
- starts the API and the UI in the background
- lets you stop or restart the full app, or just the API/UI, from a simple panel
- opens the app in your browser

You can also use command-line shortcuts:

```bat
finai-panel.bat start
finai-panel.bat stop
finai-panel.bat restart
finai-panel.bat status
finai-panel.bat restart-api
finai-panel.bat restart-ui
```

The launcher stores temporary PID files in `.finai-runtime/` so it can stop and restart the right processes.
It also writes runtime logs there, including `api.out.log`, `api.err.log`, `ui.out.log`, and `ui.err.log`.

## Running Frontend And Backend Separately

Start only the backend:

```bash
npm run server
```

Start only the frontend:

```bash
npm run client
```

This is useful when you only want to work on one side of the app.

## Build

Create a production frontend build:

```bash
npm --prefix client run build
```

The built files are written to:

```text
client/dist
```

Important:

- this project currently only has a frontend build script
- you still run the backend separately with `npm run server`

## Local Data Storage

- The SQLite database file lives at `server/finances.db`.
- It is created automatically on first run if it does not already exist.
- The app persists data locally on the machine running the backend.

## Useful URLs

- App UI: `http://localhost:5173`
- API health check: `http://localhost:3001/api/health`

## Project Structure

```text
.
â”œâ”€â”€ client/        # React + Vite frontend
â”œâ”€â”€ server/        # Express API and SQLite database setup
â”œâ”€â”€ package.json   # root scripts for full-stack development
â””â”€â”€ .env           # local environment variables
```

## Troubleshooting

### Port already in use

If `3001` or `5173` is already in use, stop the conflicting process or change the port:

- backend port: update `PORT` in `.env`
- frontend port: update `client/vite.config.js`

If you change the frontend port, also update the allowed origins in `server/index.js`, because the backend currently allows only:

- `http://localhost:5173`
- `http://localhost:5174`

### AI Advisor says the API key is missing

Make sure your root `.env` contains:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Then restart the backend.

### The frontend loads but API calls fail

Check that the backend is running on `http://localhost:3001`.

You can verify it with:

```bash
curl -sS http://localhost:3001/api/health
```

Expected response:

```json
{"status":"ok","timestamp":"..."}
```

### Fresh install issues

If dependencies are missing or out of sync, rerun:

```bash
npm run install:all
```

## Available Screens

- Dashboard
- Accounts
- Income
- Expenses
- Subscriptions
- CSV Import
- Budget Goals
- AI Advisor
- Settings
