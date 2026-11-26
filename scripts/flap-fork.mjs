import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { AbiCoder, Contract, JsonRpcProvider, parseEther, toBeHex } from 'ethers';
import { compile } from './compile.mjs';
import { deployFactories } from './chain.mjs';
import { HUB, GUARDIAN, TESTNET, TOKEN_IMPLEMENTATION, X_VERIFIER, PROXY_ADMIN, WBNB, ROUTER, PUBLIC_RPC, CREATE_EVENT, CONFIG_TUPLE, mineSalt } from './flap.mjs';

const upstream = process.env.BSC_TESTNET_RPC || PUBLIC_RPC;
const port = Number(process.env.FLAP_FORK_PORT || 18546);
const url = 'http://127.0.0.1:' + port;
console.log('Compiling Pool Launch contracts…');
const artifacts = compile();
const anvil = spawn(process.env.ANVIL_BIN || 'anvil', ['--silent', '--host', '127.0.0.1', '--port', String(port), '--fork-url', upstream, '--chain-id', String(TESTNET)], {
  stdio: ['ignore', 'ignore', 'pipe']
});
let startupError;
anvil.stderr.on('data', data => process.stderr.write(data));
anvil.on('error', error => { startupError = error; });
const rpc = new JsonRpcProvider(url, TESTNET, { staticNetwork: true, batchMaxCount: 1, cacheTimeout: -1, pollingInterval: 300 });
const send = async operation => (await operation).wait();

async function waitForFork() {
  for (let i = 0; i < 100; ++i) {
    if (startupError || anvil.exitCode !== null) throw startupError ?? new Error('Fork process exited.');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
      });
      if (Number((await response.json()).result) === TESTNET) return;
    } catch {
      await delay(200);
    }
  }
  throw new Error('BSC testnet fork did not start.');
}

async function run() {
  await waitForFork();
  const [creator, alice, bob, trader] = await rpc.listAccounts();
  const adminAddress = await new Contract(PROXY_ADMIN, ['function owner() view returns (address)'], rpc).owner();
  const portal = new Contract(HUB, [...artifacts.IPortal.abi, CREATE_EVENT], creator);
  console.log('Using real Pool Launch Portal at fork block', await rpc.getBlockNumber());
  console.log('Deploying factories and card adapters…');
  const { collections, launcherFactory, vaultFactory, random } = await deployFactories(artifacts, creator, HUB, GUARDIAN, X_VERIFIER);
  const launcherFactoryAddress = await launcherFactory.getAddress();
  const vaultFactoryAddress = await vaultFactory.getAddress();
  console.log('Checking Launcher Factory registration…');
  assert.equal((await portal.launcherFactoryMultiplier(launcherFactoryAddress))[0], false);
  // The following account impersonation is restricted to the loopback fork.
  await rpc.send('anvil_impersonateAccount', [adminAddress]);
  await rpc.send('anvil_setBalance', [adminAddress, toBeHex(parseEther('100'))]);
  const fromAdmin = (name, args) => rpc.send('eth_sendTransaction', [{
    from: adminAddress, to: HUB, data: portal.interface.encodeFunctionData(name, args), gas: '0x989680'
  }]);
  const waitAdmin = async hash => assert.equal((await rpc.waitForTransaction(hash)).status, 1);
  await waitAdmin(await fromAdmin('setLauncherFactoryMultiplier', [launcherFactoryAddress, 100, true]));
  await waitAdmin(await fromAdmin('setVaultFactoryMultiplier', [vaultFactoryAddress, 100, true]));
  await rpc.send('anvil_stopImpersonatingAccount', [adminAddress]);

  console.log('Factory enabled on fork. Creating Launcher…');
  const target = parseEther('6');
  const { salt, token: predicted } = mineSalt(TOKEN_IMPLEMENTATION);
  const data = AbiCoder.defaultAbiCoder().encode([CONFIG_TUPLE], [
    ['PackLaunch Fork', 'PACK', '', salt, target, 86400, collections[0].address]
  ]);
  const creation = await send(portal.newLauncher(launcherFactoryAddress, data, { value: await portal.SALT_LOCK_FEE() }));
  const event = creation.logs.filter(log => log.address === HUB).map(log => portal.interface.parseLog(log)).find(log => log?.name === 'FlapNewLauncherCreated');
  assert.ok(event, 'Portal did not emit Launcher creation');
  assert.equal((await portal.getLauncher(event.args.launcher)).launcherFactory, launcherFactoryAddress);
  const launcher = new Contract(event.args.launcher, artifacts.PackLauncher.abi, creator);
  await send(launcher.connect(alice).contribute({ value: parseEther('2') }));
  await send(launcher.connect(bob).contribute({ value: parseEther('4') }));
  await send(launcher.connect(alice).completeAlbum());
  console.log('Launching through Pool Launch…');
  await send(launcher.launch());
  const tokenAddress = await launcher.token();
  assert.equal(tokenAddress, predicted);
  const [vaultAddress, registeredFactory] = await portal.getLaunchVault(tokenAddress);
  assert.equal(vaultAddress, await launcher.vault());
  assert.equal(registeredFactory, vaultFactoryAddress);
  const vault = new Contract(vaultAddress, artifacts.ShardVault.abi, creator);
  assert.equal(await vault.cards(), collections[0].address);
  await send(launcher.connect(alice).claim());
  await send(launcher.connect(bob).claim());

  const token = new Contract(tokenAddress, [...artifacts.DemoToken.abi, 'function taxProcessor() view returns (address)'], trader);
  const router = new Contract(ROUTER, [
    'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable',
    'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)'
  ], trader);
  const processor = new Contract(await token.taxProcessor(), [
    'function dispatch()', 'function marketQuoteBalance() view returns (uint256)'
  ], trader);
  await rpc.send('evm_increaseTime', [86401]);
  await rpc.send('evm_mine', []);
  const deadline = (await rpc.getBlock('latest')).timestamp + 1800;
  await send(router.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [WBNB, tokenAddress], trader.address, deadline, { value: parseEther('40') }));
  await send(token.approve(ROUTER, (1n << 256n) - 1n));
  for (let i = 0; i < 40 && await rpc.getBalance(vaultAddress) + await processor.marketQuoteBalance() < parseEther('0.04'); ++i) {
    const amount = await token.balanceOf(trader.address) * 30n / 100n;
    if (!amount) break;
    const before = await rpc.getBalance(trader.address);
    await send(router.swapExactTokensForETHSupportingFeeOnTransferTokens(amount, 0, [tokenAddress, WBNB], trader.address, deadline));
    const proceeds = (await rpc.getBalance(trader.address)) - before;
    if (proceeds > 0n) await send(router.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [WBNB, tokenAddress], trader.address, deadline, { value: proceeds * 9n / 10n }));
  }
  await send(processor.dispatch());
  assert.ok(await rpc.getBalance(vaultAddress) >= parseEther('0.01'), 'Real DEX tax did not fund the card');
  await send(vault.stock(parseEther('0.01')));
  const candidates = [alice.address, bob.address, trader.address].map(value => value.toLowerCase()).sort();
  const holders = [];
  for (const address of candidates) {
    if (await token.balanceOf(address) > parseEther('100000')) holders.push(address);
  }
  // Stock enough for one wallet to collect 100 shards after proportional allocation.
  while (await vault.inventoryCount() < 10n && await rpc.getBalance(vaultAddress) >= parseEther('0.01')) {
    await send(vault.stock(parseEther('0.01')));
  }
  await send(vault.publishRound(holders));
  const accounts = [alice, bob, trader];
  const claimable = await Promise.all(accounts.map(account => vault.claimable(1, account.address)));
  const winner = accounts[claimable.findIndex(amount => amount >= 100n)];
  assert.ok(winner, 'No holder has enough shards to redeem in this fixture');
  const playerVault = vault.connect(winner);
  await send(playerVault.claim(1));
  await send(playerVault.claimBox());
  await send(playerVault.openBox(1));
  await send(random.reveal(vaultAddress, 1, 0));
  const [cardId] = await vault.wonCards(winner.address);
  const collection = new Contract(collections[0].address, artifacts.DemoCards.abi, rpc);
  assert.equal(await collection.ownerOf(cardId), winner.address);
  console.log('PASS: official Portal registered the Launcher and Vault; DEX tax purchased cards; shards redeemed for an ERC-721.');
  console.log('All transactions were executed on the isolated fork.');
}

try {
  await run();
} catch (error) {
  console.error(error.shortMessage || error.message);
  if (error.data) console.error('Revert data:', error.data);
  if (error.transaction?.to) console.error('Call:', error.transaction.to, error.transaction.data?.slice(0, 10));
  process.exitCode = 1;
} finally {
  rpc.destroy();
  anvil.kill();
}
