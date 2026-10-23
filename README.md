# 🏏 Crease

**An Offline-First Cricket Scoring & Team Management Application**

Crease is a modern cricket scoring web application built with Next.js. It helps teams manage players, record ball-by-ball scores, track match results, and analyze cricket statistics.

Designed as a Progressive Web App (PWA), Crease supports offline scoring using IndexedDB, with MongoDB-backed team accounts and cloud synchronization.

**[Live Application](https://crease-scoring.vercel.app/)** · **[GitHub Repository](https://github.com/hussnain-stack14/Cricket-Scoring-Web-App-)**

---

## Features

### Cricket Scoring

- Ball-by-ball scoring with runs, wickets, and extras
- Match creation and team selection
- Match history and scorecards
- Player batting and bowling statistics
- Match reports and PDF exports
- Scoring corrections and undo functionality

### Team Management

- Create and manage cricket teams
- Add, edit, and manage players
- Team ID and password authentication
- Account settings and security
- Team-specific records and statistics

### Offline & Cloud

- Installable Progressive Web App
- IndexedDB-based offline storage
- Offline match scoring
- MongoDB cloud synchronization
- Account-specific local data
- Synchronization status and manual sync controls

> **Note:** Offline availability and multi-device synchronization depend on successful initial data caching, authentication, and synchronization. These workflows should be verified before production use.

---

## Tech Stack

| Layer            | Technologies                            |
| ---------------- | --------------------------------------- |
| Frontend         | Next.js, React, JavaScript              |
| Styling          | Existing project CSS and UI components  |
| Backend          | Next.js API Routes, Node.js             |
| Cloud Database   | MongoDB Atlas, Mongoose                 |
| Offline Database | IndexedDB, Dexie.js                     |
| Authentication   | Team ID, password, server-side sessions |
| PWA              | Service Worker, Web App Manifest        |
| Deployment       | Vercel, AWS-compatible Next.js hosting  |
| Version Control  | Git, GitHub                             |

---

## Project Structure

Crease uses a **single Next.js application** with a clear separation between frontend components and server-only backend modules.

It does not require a separate Express server.\


````text
```text
````

```text
Cricket-Scoring-Web-App/
│
├── frontend/
│   │
│   ├── app/
│   │   ├── api/               # Next.js serverless API routes
│   │   └── ...                # Application pages and layouts
│   │
│   ├── components/            # React UI components
│   │
│   ├── lib/
│   │   ├── server/            # Compatibility imports
│   │   └── ...                # Scoring, IndexedDB, sync, reports
│   │
│   ├── backend/               # Server-only backend modules
│   │   ├── db.js              # MongoDB connection
│   │   ├── models.js          # Database models
│   │   ├── accountAuth.js     # Account authentication
│   │   ├── session.js         # Session management
│   │   └── rateLimit.js       # API rate limiting
│   │
│   ├── public/                # PWA assets and icons
│   ├── scripts/               # PWA build scripts
│   ├── tests/                 # Automated tests
│   │
│   ├── package.json
│   └── next.config.mjs
│
├── package.json               # Root convenience scripts
├── .gitignore
└── README.md
```

````text
```
````

### Architecture

**Frontend:** Handles application pages, user interfaces, cricket scoring interactions, offline storage, and synchronization requests.

**Backend:** Contains MongoDB connections, authentication, session management, and other server-only functionality.

**API Layer:** Next.js API routes connect frontend requests to backend services.

**Local Storage:** IndexedDB stores cricket records on the user's device for offline access.

**Cloud Storage:** MongoDB Atlas stores synchronized account and cricket data.

---

## Getting Started

### Prerequisites

Ensure the following are installed:

- Node.js (a version supported by the project's Next.js release)
- npm
- Git
- MongoDB Atlas account for cloud functionality

### 1. Clone the Repository

```bash
git clone https://github.com/hussnain-stack14/Cricket-Scoring-Web-App-.git
cd Cricket-Scoring-Web-App-
```

### 2. Install Dependencies

```bash
cd frontend
npm ci
```

### 3. Configure Environment Variables

Create a `.env.local` file inside the `frontend` directory.

```env
MONGODB_URI=your_mongodb_connection_string
SESSION_SECRET=your_secure_random_session_secret
```

Use a strong, randomly generated session secret.

Never commit `.env.local` or production credentials to GitHub.

### 4. Start the Development Server

```bash
npm run dev
```

Open:

**[http://localhost:3000](http://localhost:3000)**

---

## Testing & Production Build

Run automated tests:

```bash
cd frontend
npm test
```

Create a production build:

```bash
npm run build
```

Start the production server using the start script configured in `frontend/package.json`.

The production build and critical account/synchronization workflows should be verified before deployment.

---

## Deployment

### Vercel

Crease can be deployed using Vercel's Next.js support.

1. Import the GitHub repository into Vercel.
2. Select the **Next.js** framework preset.
3. Set the **Root Directory** to `frontend`.
4. Configure `MONGODB_URI` and `SESSION_SECRET` as environment variables.
5. Deploy the application.
6. Verify authentication, database access, cloud sync, and offline PWA behavior.

All application source files, including the server-only `backend/` directory, are located inside `frontend/`.

### AWS

Crease can also be deployed using an AWS hosting configuration that supports Next.js server-side rendering and API routes, such as a compatible AWS Amplify Hosting setup.

Verify support for the project's Next.js version, server-side routes, environment variables, and PWA behavior before deployment.

---

## Offline-First Architecture

Crease uses two storage layers:

| IndexedDB                  | MongoDB Atlas                |
| -------------------------- | ---------------------------- |
| Local device storage       | Cloud database               |
| Offline cricket scoring    | Shared account records       |
| Cached players and matches | Cross-device synchronization |
| Pending local changes      | Server-side persistence      |

The intended synchronization workflow is:

1. Read and write cricket records locally.
2. Queue changes when offline.
3. Synchronize pending changes when connectivity returns.
4. Download updated records from the server.
5. Update the local database and interface.

The application must preserve unsynchronized changes and handle synchronization conflicts safely.

---

## Security

Crease's account architecture includes:

- Team ID and password authentication
- Server-side password verification
- Session-based authentication
- Account-scoped data access
- Protected backend API routes
- Server-only MongoDB credentials

Authentication, session handling, account isolation, and secure sign-out should be tested as part of production readiness.

---

## Development Guidelines

This project prioritizes readable and maintainable JavaScript.

- Keep components focused and reusable.
- Keep database and authentication logic on the server.
- Avoid unnecessary abstractions and duplicated code.
- Preserve offline-first functionality.
- Keep cricket scoring calculations independent of UI components.
- Test existing features before introducing architectural changes.

---

## Project Status

**Active Development**

Crease is being improved with a focus on offline reliability, multi-device synchronization, account security, responsive design, and maintainable architecture.

---

## License

No license is specified in this README. Usage and redistribution rights remain subject to the repository's actual license, if one is added.

---

**Crease — Every Ball Counts.**
