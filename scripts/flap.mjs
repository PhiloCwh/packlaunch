import { randomBytes } from 'node:crypto';
import { getAddress, getCreate2Address, hexlify, keccak256, toBeHex } from 'ethers';

export const HUB = getAddress('0x000042108465206185a077edc3f3fd2b49060000');
export const GUARDIAN = getAddress('0x00004d58290854c5e9880f4b5b1993c6ad8b0000');
export const TESTNET = 97;
export const TOKEN_IMPLEMENTATION = getAddress('0x7777c57ff7dc441c1715b2e36fa581c48b782222');
export const X_VERIFIER = getAddress('0x236c4af8e0674fb22a139dde4c2a518cba819932');
export const PROXY_ADMIN = getAddress('0x0000ed588dfc01749c20ba69b5f8c77d706e0000');
export const WBNB = getAddress('0xae13d989dac2f0debff460ac112a837c89baa7cd');
export const ROUTER = getAddress('0xc9d63ddcb9549578057eab6a83a543ddfee2b8c3');
export const PUBLIC_RPC = 'https://bsc-testnet-rpc.publicnode.com';
export const CREATE_EVENT = 'event FlapNewLauncherCreated(address launcher,address launcherFactory,address creator,string description)';
export const CONFIG_TUPLE = 'tuple(string,string,string,bytes32,uint256,uint256,address)';

export function mineSalt(impl) {
  const initCode = '0x3d602d80600a3d3981f3363d3d373d3d3d363d73'
    + getAddress(impl).slice(2).toLowerCase() + '5af43d82803e903d91602b57fd5bf3';
  const hash = keccak256(initCode);
  const seed = BigInt(hexlify(randomBytes(31))) << 8n;
  for (let offset = 0n; ; ++offset) {
    const salt = toBeHex(seed + offset, 32);
    const token = getCreate2Address(HUB, salt, hash);
    if (token.toLowerCase().endsWith('7777')) return { salt, token };
  }
}
