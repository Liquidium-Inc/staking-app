import { writeFile } from 'node:fs/promises';

import { Actor, fetchCandid, HttpAgent } from '@icp-sdk/core/agent';
import dotenv from 'dotenv';

dotenv.config();

const canisterId = process.env.CANISTER_ID;
const ICP_HOST = 'https://icp-api.io';

if (!canisterId) {
  throw new Error('CANISTER_ADDRESS is not set');
}

async function main() {
  const didjs_interface = ({ IDL }) =>
    IDL.Service({
      did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ['query']),
    });

  const agent = await HttpAgent.create({ host: ICP_HOST, fetch });

  const did = await fetchCandid(canisterId, agent);
  console.log(did);

  const actor = Actor.createActor(didjs_interface, {
    agent,
    canisterId: 'a4gq6-oaaaa-aaaab-qaa4q-cai',
  });

  const js = await actor.did_to_js(did);

  if (js.length === 0) {
    throw new Error('Canister returned no JavaScript interface');
  }

  await writeFile('did.js', js[0]);
}

main();
