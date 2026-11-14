import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseSecret);
const { default: app } = await (useSupabase ? import('./supabase-app.js') : import('./sqlite-app.js'));

export { app };
export default app;

const port = Number(process.env.PORT || 3000);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(port, () => console.log(`SubnetLab listening on port ${port} using ${useSupabase ? 'Supabase PostgreSQL' : 'local SQLite'}`));
}
