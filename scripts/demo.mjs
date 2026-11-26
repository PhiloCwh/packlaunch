import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { AbiCoder, Contract, JsonRpcProvider, id, parseEther } from 'ethers';
import { compile } from './compile.mjs';
import { deploy, deployFactories, writeFrontend } from './chain.mjs';
import { serve } from './server.mjs';

const test = process.argv.includes('--test');
const port = Number(process.env.DEMO_RPC_PORT || (test ? 18545 : 8545));
const rpcUrl = 'http://127.0.0.1:' + port;
const chainId = 31337;
const target = parseEther('6');
console.log('Compiling contracts…');
const artifacts = compile();
const anvil = spawn('anvil', ['--silent', '--host', '127.0.0.1', '--port', String(port), '--chain-id', String(chainId)]);
let spawnError;
anvil.on('error', error => { spawnError = error; });
anvil.stderr.on('data', data => process.stderr.write(data));
const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true, cacheTimeout: -1, pollingInterval: 250 });
let server;

function stop() {
  server?.close();
  provider.destroy();
  anvil.kill();
}

const send = async promise => (await promise).wait();
const contract = (name, address, runner) => new Contract(address, artifacts[name].abi, runner);
const lower = address => address.toLowerCase();
const encode = (salt, raised, seconds, collection) => AbiCoder.defaultAbiCoder().encode(
  ['tuple(string,string,string,bytes32,uint256,uint256,address)'], [['PackLaunch', 'PACK', '', id(salt), raised, seconds, collection]]
);

async function setup() {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (spawnError || anvil.exitCode !== null || anvil.signalCode) throw spawnError ?? new Error('Anvil exited.');
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 })
      });
      ready = Number((await response.json()).result) === chainId;
      if (ready) break;
    } catch {
      await delay(100);
    }
  }
  if (!ready) throw new Error('Anvil did not start.');

  const [owner, alice, bob, carol, dave, trader] = await provider.listAccounts();
  const portal = await deploy(artifacts, owner, 'DemoPortal');
  const hub = await portal.getAddress();
  const verifier = await deploy(artifacts, owner, 'DemoXVerifier');
  const xVerifier = await verifier.getAddress();
  const { collections, random, vaultFactory, launcherFactory } = await deployFactories(artifacts, owner, hub, owner.address, xVerifier);
  const cards = contract('DemoCards', collections[0].address, owner);
  const showcase = contract('CardShowcase', collections[0].showcase, owner);
  const factory = await launcherFactory.getAddress();
  await send(portal.setLauncherFactory(factory, true));

  async function create(salt, amount = target, duration = 86400, collection = collections[0].address) {
    const receipt = await send(portal.newLauncher(factory, encode(salt, amount, duration, collection), { value: await portal.SALT_LOCK_FEE() }));
    const created = receipt.logs.map(log => {
      try { return portal.interface.parseLog(log); } catch { return null; }
    }).find(log => log?.name === 'FlapNewLauncherCreated');
    return contract('PackLauncher', created.args.launcher, owner);
  }

  const launcher = await create('PackLaunch local seed');
  const users = [
    { label: 'Alice', signer: alice, contribution: '1.2', balance: '120000', fragments: 240n },
    { label: 'Bob', signer: bob, contribution: '1.8', balance: '180000', fragments: 360n },
    { label: 'Carol', signer: carol, contribution: '2', balance: '200000', fragments: 400n },
    { label: 'Dave', signer: dave, contribution: '1', balance: '100000', fragments: 0n }
  ];
  for (const user of users) await send(launcher.connect(user.signer).contribute({ value: parseEther(user.contribution) }));
  assert.equal(await launcher.albumMask(), 7n);
  await send(launcher.launch());

  const token = contract('DemoToken', await launcher.token(), owner);
  const vault = contract('ShardVault', await launcher.vault(), owner);
  const pool = contract('DemoPool', await launcher.pool(), trader);
  for (const user of users) {
    await send(launcher.connect(user.signer).claim());
    assert.equal(await token.balanceOf(user.signer.address), parseEther(user.balance));
  }

  await send(pool.buy({ value: parseEther('4') }));
  assert.equal(await provider.getBalance(await vault.getAddress()), parseEther('0.12'));
  const price = await cards.price();
  for (let i = 0; i < 10; i++) await send(vault.stock(price));

  const eligible = users.slice(0, 3).map(user => lower(user.signer.address)).sort();
  await assert.rejects(vault.publishRound.staticCall([...eligible, lower(dave.address)].sort()), /Below threshold/);
  await assert.rejects(vault.publishRound.staticCall([...eligible, lower(await pool.getAddress())].sort()), /Invalid holder list/);
  await send(vault.publishRound(eligible));
  for (const user of users) assert.equal(await vault.claimable(1n, user.signer.address), user.fragments);

  const deployment = {
    collections, xVerifier,
    chainId, rpcUrl, demo: true, sealedBoxes: true, hub, factory, vaultFactory: await vaultFactory.getAddress(),
    launcher: await launcher.getAddress(), cards: await cards.getAddress(), random: await random.getAddress(),
    operator: owner.address, accounts: users.map(user => ({ label: user.label, address: user.signer.address }))
  };

  if (!test) {
    await send(vault.connect(alice).claim(1));
    await send(vault.connect(alice).open());
    await send(random.reveal(await vault.getAddress(), 1, 3));
    writeFrontend(artifacts, deployment, process.env.PACKLAUNCH_FRONTEND_CONFIG);
    server = serve();
    console.log('Seeded 4 wallets, 1 dividend round, 10 funded cards, and 1 completed opening.');
    return;
  }

  await assert.rejects(create('Unsupported collection', target, 86400, alice.address), /Unsupported collection/);
  const second = await create('Night Legends seed', target, 86400, collections[1].address);
  await send(second.connect(alice).contribute({ value: target }));
  await send(second.connect(alice).completeAlbum());
  await send(second.launch());
  await send(second.connect(alice).claim());
  const secondVault = contract('ShardVault', await second.vault(), owner);
  await send(contract('DemoPool', await second.pool(), trader).buy({ value: parseEther('4') }));
  await send(secondVault.stock(price));
  await send(secondVault.publishRound([alice.address]));
  assert.equal(await secondVault.cards(), collections[1].address);
  assert.equal(await secondVault.claimable(1, alice.address), 100n);
  assert.equal(await vault.claimable(1, alice.address), 240n);
  assert.equal(await contract('DemoCards', collections[1].address, owner).ownerOf(1), await secondVault.getAddress());

  const aliceVault = vault.connect(alice);
  await assert.rejects(aliceVault.open.staticCall(), /Need 100/);
  await assert.rejects(vault.connect(dave).claim.staticCall(1), /Nothing to claim/);
  await send(aliceVault.claim(1));
  await assert.rejects(aliceVault.claim.staticCall(1), /Nothing to claim/);
  assert.equal(await vault.outstanding(), 1000n);
  await send(aliceVault.claimBox());
  assert.equal(await vault.sealedBox(1), true);
  assert.equal(await vault.pendingCount(), 1n);
  assert.equal(await vault.fragments(alice.address), 140n);
  await assert.rejects(vault.connect(bob).openBox.staticCall(1), /No sealed box owned by caller/);
  await send(aliceVault.openBox(1));
  assert.equal(await vault.sealedBox(1), false);
  await assert.rejects(aliceVault.open.staticCall(), /Need 100/);
  await assert.rejects(aliceVault.fulfill.staticCall(1, 3), /Random source only/);
  await send(random.reveal(await vault.getAddress(), 1, 3));
  assert.equal(await cards.ownerOf(4), alice.address);
  const vaultAddress = await vault.getAddress();
  const proof = [123n, 'demo', 321n, await showcase.challenge(alice.address, vaultAddress, 4)];
  await assert.rejects(showcase.connect(alice).showcase.staticCall(vaultAddress, 4, proof, '0x'), /Invalid X proof/);
  await send(verifier.approveProof(proof));
  await assert.rejects(showcase.connect(bob).showcase.staticCall(vaultAddress, 4, proof, '0x'), /Card owner only/);
  await send(showcase.connect(alice).showcase(vaultAddress, 4, proof, '0x'));
  assert.equal(await showcase.showcasedTweet(4), 123n);
  await assert.rejects(showcase.connect(alice).showcase.staticCall(vaultAddress, 4, proof, '0x'), /Already showcased/);

  assert.equal(await vault.inventoryCount(), 9n);
  assert.equal(await vault.outstanding(), 900n);

  await send(aliceVault.claimBox());
  await send(aliceVault.cancel(2));
  assert.equal(await vault.fragments(alice.address), 140n);
  await send(aliceVault.claimBox());
  await send(aliceVault.openBox(3));
  await assert.rejects(aliceVault.cancel.staticCall(3), /Request still active/);
  const expiry = (await vault.requests(3)).deadline;
  await provider.send('evm_setNextBlockTimestamp', [Number(expiry) + 1]);
  await provider.send('evm_mine', []);
  assert.ok(BigInt((await provider.getBlock('latest')).timestamp) > expiry);
  await send(aliceVault.cancel(3));
  assert.equal(await vault.fragments(alice.address), 140n);
  assert.equal(await vault.pendingCount(), 0n);
  assert.equal(await vault.outstanding(), 900n);

  const failedSale = await create('Refund smoke test', parseEther('1'), 120);
  await send(failedSale.connect(alice).contribute({ value: parseEther('0.5') }));
  await provider.send('evm_setNextBlockTimestamp', [Number(await failedSale.deadline()) + 1]);
  await provider.send('evm_mine', []);
  await send(failedSale.connect(alice).refund());
  assert.equal(await failedSale.raised(), 0n);
  console.log('PASS: factory launch, allocation, strict threshold, tax funding, eligibility, claim guards, NFT delivery, timeout and refund.');
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  await setup();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  stop();
} finally {
  if (test) stop();
}
