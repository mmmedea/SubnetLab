// Catch all /api/* requests and forward them to the existing Express app.
// Vercel builds this file as a Node.js Function; Express keeps ownership of
// authentication, validation, and every /api/v1 route.
import app from '../src/server/index.js';

export default app;
