import mempoolJs from '@mempool/mempool.js';
import axios from 'axios';

import { config } from '@/config/config';

const host = config.mempool.host;

export const mempool = {
  ...mempoolJs({
    hostname: host,
    // No call may hang a request; an unanswered broadcast counts as attempted (see stored-signature)
    config: { timeout: 20_000 },
  }).bitcoin,
  async getPrice() {
    const { data } = await axios.get<{
      time: number;
      USD: number;
      EUR: number;
      GBP: number;
      CAD: number;
      CHF: number;
      AUD: number;
      JPY: number;
    }>(`https://${host}/api/v1/prices`, { timeout: 20_000 });
    return data;
  },
};
