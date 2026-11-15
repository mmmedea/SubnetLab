// Vercel's Express framework detector looks for a root-level app/index/server
// entrypoint. Keep the application implementation in src/server/index.js and
// expose it here so Vercel can route API requests through the existing Express app.
import app from './src/server/index.js';

export default app;
