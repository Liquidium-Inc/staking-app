// obtenerInterfaz.js
const { HttpAgent, fetchCandid, Actor } = require('@dfinity/agent');
const fs = require('fs/promises');

require('dotenv').config();

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

  const agent = new HttpAgent({ host: ICP_HOST, fetch });

  const did = await fetchCandid(canisterId, agent);
  console.log(did);

  const actor = Actor.createActor(didjs_interface, {
    agent,
    canisterId: 'a4gq6-oaaaa-aaaab-qaa4q-cai',
  });

  const js = await actor.did_to_js(did);

  await fs.writeFile('did.js', js);
}

main();
