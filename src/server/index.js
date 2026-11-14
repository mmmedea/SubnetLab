import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './supabase-app.js';

export { app };
export default app;

const port = Number(process.env.PORT || 3000);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(port, () => console.log('SubnetLab listening on port ' + port + ' with Supabase PostgreSQL'));
}
