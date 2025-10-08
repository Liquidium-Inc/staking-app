import { sql, schema } from './client';
import { poolBalance } from './poolBalance.service';
import { stake } from './stake.service';
import { unstake } from './unstake.service';

const db = { stake, unstake, poolBalance };

export { db, sql, schema };
