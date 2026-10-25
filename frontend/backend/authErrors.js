const mongoConnectionError =
  /^(MongooseServerSelectionError|Mongo(?:Network|ServerSelection|Parse|Server|Operation|Timeout).*)$/;

export function authenticationServiceFailure(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const name = typeof error?.name === 'string' ? error.name : '';

  if (message.includes('MONGODB_URI environment variable is not set')) {
    return {
      status: 503,
      error:
        'MongoDB is not configured. Set MONGODB_URI in frontend/.env.local and restart the development server.',
    };
  }
  if (mongoConnectionError.test(name) || message.includes('MONGODB_URI')) {
    return {
      status: 503,
      error:
        'MongoDB is unavailable. Check that the database is running and MONGODB_URI is configured.',
    };
  }
  if (message.includes('SESSION_SECRET')) {
    return {
      status: 503,
      error:
        'Authentication is not configured. Set SESSION_SECRET (at least 32 characters) in frontend/.env.local and restart the development server.',
    };
  }
  return {
    status: 500,
    error: 'Authentication service encountered a server error. Please try again.',
  };
}
