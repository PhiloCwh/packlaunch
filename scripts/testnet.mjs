import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  Contract, JsonRpcProvider, NonceManager, Wallet, formatEther, getAddress, hexlify, id,
  parseEther, ZeroAddress
} from 'ethers';
import { compile } from './compile.mjs';
import { deployFactories, writeFrontend } from './chain.mjs';

import { HUB, GUARDIAN, TESTNET, X_VERIFIER, PUBLIC_RPC, mineSalt } from './flap.mjs';

const [task, ...args] = process.argv.slice(2);


function readEnvironment() {
  const keyFile = process.env.PACKLAUNCH_TESTNET_KEY_FILE;
  const key = process.env.PACKLAUNCH_TESTNET_KEY || (keyFile && fs.readFileSync(keyFile, 'utf8').trim());
  if (!key) throw new Error('Set PACKLAUNCH_TESTNET_KEY or PACKLAUNCH_TESTNET_KEY_FILE.');
  const rpc = process.env.BSC_TESTNET_RPC || PUBLIC_RPC;
  return { provider: new JsonRpcProvider(rpc, undefined, { batchMaxCount: 1 }), key };
}

async function holderList(provider, vault, firstBlock) {
  const tokenAddress = await vault.token();
  const toBlock = await provider.getBlockNumber();
  if (!Number.isSafeInteger(firstBlock) || firstBlock < 0 || firstBlock > toBlock) throw new Error('Invalid launch block.');
  const exclusions = new Set([ZeroAddress, await vault.pool(), await vault.getAddress(), await vault.launcher()].map(a => a.toLowerCase()));
  const transfer = id('Transfer(address,address,uint256)');
  const candidates = new Set();
  for (let start = firstBlock; start <= toBlock; start += 2000) {
    const logs = await provider.getLogs({ address: tokenAddress, topics: [transfer], fromBlock: start, toBlock: Math.min(start + 1999, toBlock) });
    for (const log of logs) {
      for (const topic of log.topics.slice(1, 3)) candidates.add(getAddress('0x' + topic.slice(-40)).toLowerCase());
    }
  }
  const token = new Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
  const addresses = [...candidates].filter(a => !exclusions.has(a));
  const eligible = [];
  for (let i = 0; i < addresses.length; i += 20) {
    const page = addresses.slice(i, i + 20);
    const balances = await Promise.all(page.map(a => token.balanceOf(a, { blockTag: toBlock })));
    eligible.push(...page.filter((_, index) => balances[index] > parseEther('100000')));
  }
  return { block: toBlock, eligible: eligible.sort() };
}

async function main() {
  if (task === 'salt') {
    if (!args[0]) throw new Error('Pass the currently deployed Flap Pool Launch tax-token implementation address.');
    console.log(mineSalt(args[0]));
    return;
  }
  const { provider, key } = readEnvironment();
  if ((await provider.getNetwork()).chainId !== BigInt(TESTNET)) throw new Error('BSC testnet (97) required.');
  const owner = new NonceManager(new Wallet(key, provider));

  if (task === 'deploy') {
    const rpcUrl = process.env.PACKLAUNCH_PUBLIC_RPC || PUBLIC_RPC;
    const address = await owner.getAddress();
    const [balance, portalCode, fees] = await Promise.all([
      provider.getBalance(address), provider.getCode(HUB), provider.getFeeData()
    ]);
    console.log('BSC Testnet (97) deployer:', address);
    console.log('Balance:', formatEther(balance), 'tBNB');
    if (portalCode === '0x') throw new Error('Flap Portal has no code on this RPC.');
    console.log('Flap Portal bytecode verified.');
    if (balance === 0n) throw new Error('Deployer requires tBNB before broadcasting.');
    const gasBudget = (fees.gasPrice ?? 0n) * 15_000_000n;
    console.log('Planning estimate for factory and adapter deployment:', formatEther(gasBudget), 'tBNB');
    if (balance < gasBudget) throw new Error('Deployer balance is below the conservative deployment budget.');

    const artifacts = compile();
    const xVerifier = X_VERIFIER;
    const { launcherFactory, vaultFactory, collections, random } = await deployFactories(artifacts, owner, HUB, GUARDIAN, xVerifier);
    const deployment = {
      collections, xVerifier,
      chainId: TESTNET, rpcUrl, demo: false, mockCards: true, sealedBoxes: true, hub: HUB, factory: await launcherFactory.getAddress(),
      vaultFactory: await vaultFactory.getAddress(), random: await random.getAddress()
    };
    writeFrontend(artifacts, deployment);
    const manifest = JSON.parse(fs.readFileSync('flap-ui/manifest.template.json', 'utf8'));
    manifest.factoryAddress = deployment.factory;
    fs.writeFileSync('flap-ui/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    console.log(deployment);
    console.log('Request Flap enablement before Portal.newLauncher.');
    return;
  }

  const deployment = JSON.parse(fs.readFileSync('public/deployment.json', 'utf8'));
  if (deployment.chainId !== TESTNET) throw new Error('Switch frontend config to the BSC testnet deployment first.');
  const abis = JSON.parse(fs.readFileSync('public/abis.json', 'utf8'));
  const vault = new Contract(getAddress(args[0]), abis.ShardVault, owner);
  if (task === 'dispatch') {
    const tokenAddress = await vault.token();
    const portal = new Contract(HUB, abis.IPortal, provider);
    const [registered] = await portal.getLaunchVault(tokenAddress);
    if (registered !== await vault.getAddress()) throw new Error('The Portal has not registered this vault for the token.');
    const token = new Contract(tokenAddress, ['function taxProcessor() view returns (address)'], provider);
    const processor = new Contract(await token.taxProcessor(), ['function dispatch()'], owner);
    const before = await provider.getBalance(registered);
    const tx = await processor.dispatch();
    const receipt = await tx.wait();
    const after = await provider.getBalance(registered, receipt.blockNumber);
    console.log('Dispatch transaction:', tx.hash);
    console.log('Vault BNB before / after:', formatEther(before), '/', formatEther(after));
    return;
  }
  if (task === 'holders') {
    const result = await holderList(provider, vault, Number(args[1]));
    console.log('Observed at block ' + result.block);
    console.log(result.eligible.join('\n'));
    return;
  }
  if (task === 'reveal') {
    const adapter = new Contract(await vault.randomSource(), abis.DemoRandom, owner);
    const tx = await adapter.reveal(await vault.getAddress(), BigInt(args[1]), BigInt(hexlify(randomBytes(32))));
    await tx.wait();
    console.log('Reveal transaction ' + tx.hash);
    return;
  }
  throw new Error('Use deploy, salt <implementation>, dispatch <vault>, holders <vault> <launch block>, or reveal <vault> <requestId>.');
}

main().catch(error => {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
});
