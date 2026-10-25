# Sync operations

This checkout has no `frontend/.env.local`, `SESSION_SECRET`, or `MONGODB_URI` in its process environment. Account authentication and cloud synchronization cannot work until each environment provides its own values.

Copy `.env.example` to `.env.local`, set a distinct random `SESSION_SECRET` of at least 32 characters, and configure the intended development Atlas URI. Configure the same variable names separately in the production host; do not copy development credentials to production. Restart the development server after changing environment values.

When a device reports pending changes, use **Export sync diagnostics** in the sign-out dialog. The generated JSON is read-only and reports the workspace/account mapping, pending operation metadata, local record counts, rejection reasons, and conflicts without exporting record payloads. It does not clear or retry the queue.

Completed match snapshots are now committed after their innings and deliveries. A receiving device defers a completed parent until its locally pulled child records reach the declared snapshot count, preventing a completed partial chase from being presented as authoritative.
