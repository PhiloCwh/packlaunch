import fs from 'node:fs';
import { ContractFactory } from 'ethers';

export const collectionSeeds = [
  { name: 'Elemental Partners', zh: '元素伙伴', symbol: 'ELEMENTAL' },
  { name: 'Night Legends', zh: '夜影传说', symbol: 'NIGHT' }
];

const exposed = ['IPortal', 'DemoPortal', 'PackLauncher', 'ShardVault', 'DemoPool', 'DemoRandom', 'DemoCards', 'DemoToken', 'CardShowcase', 'DemoXVerifier'];

export async function deploy(artifacts, signer, name, ...args) {
  const { abi, evm } = artifacts[name];
  const contract = await new ContractFactory(abi, '0x' + evm.bytecode.object, signer).deploy(...args);
  return contract.waitForDeployment();
}

export function writeFrontend(artifacts, deployment, directory = 'public') {
  fs.mkdirSync(directory, { recursive: true });
  const abis = Object.fromEntries(exposed.map(name => [name, artifacts[name].abi]));
  fs.writeFileSync(directory + '/abis.json', JSON.stringify(abis));
  fs.writeFileSync(directory + '/deployment.json', JSON.stringify(deployment, null, 2) + '\n');
}

export async function deployFactories(artifacts, owner, hub, guardian, xVerifier) {
  const collections = [];
  for (const seed of collectionSeeds) {
    const cards = await deploy(artifacts, owner, 'DemoCards', seed.name, seed.symbol);
    const address = await cards.getAddress();
    const campaign = await deploy(artifacts, owner, 'CardShowcase', hub, address, xVerifier);
    collections.push({ ...seed, address, showcase: await campaign.getAddress() });
  }
  const random = await deploy(artifacts, owner, 'DemoRandom');
  const addresses = collections.map(collection => collection.address);
  const vaultFactory = await deploy(artifacts, owner, 'ShardVaultFactory', hub, guardian, addresses, addresses, await random.getAddress());
  const launcherFactory = await deploy(artifacts, owner, 'PackLauncherFactory', hub, guardian, await vaultFactory.getAddress());
  return { collections, random, vaultFactory, launcherFactory };
}
