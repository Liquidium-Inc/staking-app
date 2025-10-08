import mempoolJs from '@mempool/mempool.js';
import axios from 'axios';

import { config } from '@/config/config';

const host = config.mempool.host;

export const mempool = {
  ...mempoolJs({
    hostname: host,
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
    }>(`https://${host}/api/v1/prices`);
    return data;
  },
};
