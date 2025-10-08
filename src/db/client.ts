import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { config } from '@/config/config';

import * as schema from './schema';

export const sql = drizzle(neon(config.db.url), { schema });
export { schema };
