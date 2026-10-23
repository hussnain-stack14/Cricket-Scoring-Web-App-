import mongoose from 'mongoose';

// ─── TeamAccount ─────────────────────────────────────────────────────────────
// One document per registered team account.
const TeamAccountSchema = new mongoose.Schema(
  {
    teamId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      immutable: true,
    },
    loginTeamId: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 4,
      maxlength: 24,
      match: /^[A-Z0-9_-]+$/,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    passwordHash: { type: String, required: true },
    authVersion: { type: Number, default: 0 },
    // Optional email for account recovery (hashed for storage, raw kept for sending)
    recoveryEmail: { type: String, default: null },
    recoveryEmailHash: { type: String, default: null },
    // Recovery token (bcrypt hash of the token we emailed)
    recoveryTokenHash: { type: String, default: null },
    recoveryTokenExpiry: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: null },
  },
  { collection: 'teamAccounts' },
);
TeamAccountSchema.index({ loginTeamId: 1 }, { unique: true, sparse: true });

// ─── TeamMember ───────────────────────────────────────────────────────────────
// Stores invite-based members with individual roles.
// The team owner is stored in TeamAccount but also has an entry here.
const TeamMemberSchema = new mongoose.Schema(
  {
    teamId: { type: String, required: true, index: true },
    memberId: {
      type: String,
      required: true,
      // Stable UUID for this member slot, generated server-side
    },
    displayName: { type: String, required: true, trim: true, maxlength: 100 },
    role: {
      type: String,
      required: true,
      enum: ['owner', 'scorer', 'viewer'],
      default: 'viewer',
    },
    // Members use invite tokens to activate their account.
    // They don't share the owner password.
    inviteTokenHash: { type: String, default: null },
    inviteExpiry: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    // After activation, members set their own PIN / passphrase (hashed).
    credentialHash: { type: String, default: null },
    lastActiveAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'teamMembers' },
);
TeamMemberSchema.index({ teamId: 1, memberId: 1 }, { unique: true });

// ─── SyncRecord ───────────────────────────────────────────────────────────────
// Mirrors each IndexedDB record for a team.
// Table names match the client-side Dexie table names.
const SyncRecordSchema = new mongoose.Schema(
  {
    teamId: { type: String, required: true, index: true },
    table: {
      type: String,
      required: true,
      enum: ['players', 'teams', 'memberships', 'matches', 'innings', 'events', 'audits', 'drafts'],
    },
    recordId: { type: String, required: true }, // client UUID
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    revision: { type: Number, default: 0 },
    lastChangeId: { type: String, default: null },
    deletedAt: { type: Date, default: null }, // soft-delete
    updatedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'syncRecords' },
);
// Compound index for efficient per-team queries
SyncRecordSchema.index({ teamId: 1, table: 1, recordId: 1 }, { unique: true });
SyncRecordSchema.index({ teamId: 1, updatedAt: 1 });

// ─── SyncLock ─────────────────────────────────────────────────────────────────
// Enforces one active scoring device per match.
const SyncLockSchema = new mongoose.Schema(
  {
    teamId: { type: String, required: true, index: true },
    matchId: { type: String, required: true },
    lockedBy: { type: String, required: true }, // device/session identifier
    lockedByName: { type: String, default: '' }, // human-readable device name
    lockedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }, // lockedAt + 60 min
    lastHeartbeat: { type: Date, default: Date.now },
  },
  { collection: 'syncLocks' },
);
SyncLockSchema.index({ teamId: 1, matchId: 1 }, { unique: true });
// TTL index: MongoDB will auto-remove expired locks
SyncLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SessionRevocationSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'sessionRevocations' },
);
SessionRevocationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Export models (guard against re-compile in hot-reload) ──────────────────
export const TeamAccount =
  mongoose.models.TeamAccount || mongoose.model('TeamAccount', TeamAccountSchema);

export const TeamMember =
  mongoose.models.TeamMember || mongoose.model('TeamMember', TeamMemberSchema);

export const SyncRecord =
  mongoose.models.SyncRecord || mongoose.model('SyncRecord', SyncRecordSchema);

export const SyncLock = mongoose.models.SyncLock || mongoose.model('SyncLock', SyncLockSchema);

export const SessionRevocation =
  mongoose.models.SessionRevocation || mongoose.model('SessionRevocation', SessionRevocationSchema);
