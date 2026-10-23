import 'server-only';
import mongoose from 'mongoose';

// Reuse connection in serverless environment across hot-reloads
let cached = global._mongooseCache;
if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

export async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI environment variable is not set. Add it to .env.local for development and to Vercel environment variables for production.',
    );
  }
  if (cached.conn?.readyState === 1) return cached.conn;
  if (cached.conn) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 10000,
      })
      .then(() => mongoose.connection)
      .catch((error) => {
        cached.conn = null;
        cached.promise = null;
        throw error;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.conn = null;
    cached.promise = null;
    throw error;
  }
}

export function getSafeErrorDetails(error) {
  const message =
    typeof error?.message === 'string'
      ? error.message.replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[REDACTED_MONGODB_URI]')
      : 'Unknown error';
  return {
    name: typeof error?.name === 'string' ? error.name : 'Error',
    message,
    ...(error?.code !== undefined ? { code: error.code } : {}),
  };
}

export function isDatabaseConnectionError(error) {
  return (
    error?.message?.includes('MONGODB_URI') ||
    (typeof error?.name === 'string' &&
      /^(MongooseServerSelectionError|Mongo(?:Network|ServerSelection|Parse|Server|Operation|Timeout).*)$/.test(
        error.name,
      ))
  );
}
