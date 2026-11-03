import { sql, schema } from './client';
import { emailSubscription, EMAIL_TOKEN_PURPOSE } from './emailSubscription.service';
import { poolBalance } from './poolBalance.service';
import { stake } from './stake.service';
import { terms } from './terms.service';
import { unstake } from './unstake.service';
import { walletAuth } from './walletAuth.service';

const db = { stake, unstake, poolBalance, emailSubscription, walletAuth, terms };

export { db, sql, schema, EMAIL_TOKEN_PURPOSE };
