# Backend modules (Next.js server runtime)

These files are imported by the Next.js API routes in `frontend/app/api/`.
This folder is **not** a separate Express server and has no independent process.

`frontend/lib/server/` contains small re-export compatibility files so existing API route imports remain stable.

Never import backend modules from browser/client components.
