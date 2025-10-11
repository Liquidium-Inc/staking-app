import { sql, schema } from './client';
import { emailSubscription } from './emailSubscription.service';
import { poolBalance } from './poolBalance.service';
import { stake } from './stake.service';
import { unstake } from './unstake.service';
import { walletAuth } from './walletAuth.service';

const db = { stake, unstake, poolBalance, emailSubscription, walletAuth };

export { db, sql, schema };
