# PackLaunch · Flap Track

**PackLaunch turns ERC‑20 trading fees into collectible NFTs.** The token launch takes inspiration from Pokémon Trading Card Game (TCG) pack openings and Binance Wallet’s Gacha. A creator selects an NFT collection, and the community completes a genesis album and reaches its funding goal to unlock a Flap Pool Launch.

After launch, a dedicated vault spends the token’s trading fees on NFTs from that collection. Every NFT held in the vault backs up to 100 shards. Holders with more than 100,000 tokens earn shards in proportion to their holdings. With 100 shards, a player can open a mystery box and receive one NFT directly in their wallet.

The same collection drives both sides of the launch. Community collecting unlocks the pool, and trading fees replenish the card inventory. The MVP demonstrates this with original test collections.

## Submission checks

| Requirement | Evidence |
| --- | --- |
| Launcher Factory | `PackLauncherFactory` inherits the official `LauncherFactoryBase`. The normal entry is `Portal.newLauncher(factory, data)`. `PackLauncher.launch` calls `Portal.launchTaxTokenV2`. |
| BSC Testnet | Chain ID 97. The factories and adapters are deployed. The first public Launcher is awaiting Factory enablement by Flap. |
| Own UI | `public/` has the bilingual creation, funding, launch, dividend and reveal flows. `flap-ui/` contains the companion Launcher detail component based on the official template. |

## Verification completed

- BSC Testnet fork starting from block 144984965: the deployed Flap Pool Launch Portal registered the Launcher and Vault. DEX trades funded the Vault; the Vault purchased the selected ERC-721s; test holders claimed shards and redeemed a box. The test checked the final ERC-721 owner. This run used an isolated local fork.
- Launcher detail source passed the official Flap Workbench checker with the deployed BSC Testnet Launcher Factory address.
- The public BSC Testnet deployment succeeded. The Portal reports the Launcher Factory as not enabled. The first public launch and end-to-end demo are pending Flap enablement.

## BSC Testnet receipts

| Item | Address or transaction |
| --- | --- |
| Launcher Factory and Vault Factory | [Launcher Factory](https://testnet.bscscan.com/address/0x89476ab411A5d5824B7a6e0b60c8043e545baDF8) ([deployment transaction](https://testnet.bscscan.com/tx/0x131e43e5d313c751aea245713605aca83577e5d96f62ed604cadc1b423f3328f)) · [Vault Factory](https://testnet.bscscan.com/address/0x64D8CBfb37CfD6e54d5A57C68e9f3581980fb3D5) ([deployment transaction](https://testnet.bscscan.com/tx/0x9259759bb232767a62feb6b6848bff0341da1e12ac0c494033352f1321fab34c)) |
| Portal creates Launcher | Pending public testnet launch |
| Launcher creates tax token, pool and Vault | Pending public testnet launch |
| DEX trade and tax dispatch to Vault | Pending public testnet run |
| Selected NFT purchased and allocated | Pending public testnet run |
| Shard claim, box opened and NFT received | Pending public testnet run |

## Demo script

1. Select an ERC‑721 collection and create the Launcher. Show its address and Factory provenance from the Portal.
2. Contribute tBNB, complete the genesis album, and launch. Show the tax token, the DEX pool and its dedicated Vault.
3. Trade the token on the testnet pool and dispatch accumulated tax. Show the tBNB balance increase on the Vault before stocking a card from the test collection.
4. Publish the holder round. Show that a wallet holding exactly 100,000 tokens receives nothing while qualified wallets earn in proportion to their holdings.
5. Claim shards, redeem 100 for a sealed box, open it, and confirm ERC‑721 ownership in the recipient wallet.

The contest card collections are test ERC‑721 assets. The demo randomness adapter is operator-controlled. Testnet deployment can use Flap's X Verifier for the optional showcase. See [run and deployment notes](README.md).

## MVP screenshots

[Select a collection](docs/demo/01-collection-launch.jpg) · [Claim shards](docs/demo/02-shard-dividends.jpg) · [Receive a sealed box](docs/demo/03-sealed-box.jpg) · [Reveal the NFT](docs/demo/04-nft-reveal.jpg)
