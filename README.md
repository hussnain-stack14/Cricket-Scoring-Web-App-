# Crease — simplified project layout

This is a **single Next.js application**, not a separate Express backend.

```text
crease/
├── frontend/                 Next.js app, UI, offline IndexedDB, PWA
│   ├── app/                  Pages and serverless API routes
│   ├── components/           React UI
│   ├── lib/                  Scoring, offline DB, sync, reports
│   │   └── server/           Compatibility re-exports to frontend/backend/
│   ├── public/               PWA assets
│   ├── scripts/              PWA build scripts
│   ├── tests/                Existing tests
│   ├── package.json
│   └── next.config.mjs
├── frontend/backend/                  Server-only MongoDB/auth/session modules
├── package.json              Convenience commands
└── README.md
```

## Run locally

```bash
cd frontend
npm ci
npm run dev
```

Or run `npm run dev` from the repository root **after** installing dependencies in `frontend`.

## Test and build

```bash
cd frontend
npm test
npm run build
```

Set `MONGODB_URI` and `SESSION_SECRET` in `frontend/.env.local` for local server API usage. Do not commit secrets.

## Deploying to Vercel

**Important:** Moving the Next.js app to `frontend/` changes Vercel project configuration.

- Set **Root Directory** to `frontend`.
- Enable **Include source files outside of the Root Directory** because the app imports server-only modules from sibling `frontend/backend/`.
- Keep the framework preset **Next.js** and existing project environment variables.
- Verify a preview deployment (API login, sync, and offline PWA) before updating production.

The app remains deployable to AWS with a supported Next.js SSR hosting configuration; ensure sibling backend sources are included in the build context.

## Notes

- No database schema or auth logic has been intentionally changed.
- `frontend/lib/server` files are tiny compatibility re-exports, not duplicate implementations.
- This is a conservative structural refactor, not a rewrite of the large UI components.
- A working deployment still requires configuration and integration testing.


## Dependency resolution fix
Server-only modules live under `frontend/backend/` so they resolve dependencies from `frontend/node_modules`. Next.js API routes remain in `frontend/app/api/`.
