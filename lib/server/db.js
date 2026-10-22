import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

// MONGODB_URI is verified when connectDB() is invoked at runtime.

// Reuse connection in serverless environment across hot-reloads
let cached = global._mongooseCache;
if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

export async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI environment variable is not set. Add it to .env.local for development and to Vercel environment variables for production.',
    );
  }
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 10000,
      })
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
