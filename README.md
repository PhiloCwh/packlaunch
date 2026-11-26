# PackLaunch

创作者为每次发行选择一个已支持的 ERC‑721 Collection。玩家认购并集齐创世卡册，通过 Flap Pool Launch 创建税币及交易池。专属 Vault 用交易税从指定适配器采购该系列 NFT，按合格持仓发放碎片。每 100 枚对应一次本系列的 ERC‑721 兑换。每次发行独立记录库存、碎片、盲盒和奖品。

## 本地演示

需要 Node.js 20.18+ 和 Foundry 的 Anvil。项目默认使用 8545 作为本地链 RPC，4173 作为 UI 端口。用 `DEMO_RPC_PORT` 和 `APP_PORT` 可覆盖。

```sh
npm ci
npm run demo
```

打开 http://127.0.0.1:4173。演示链用 Anvil 的公开测试账户签名。页面可以切换钱包，交易会真实写入这条临时链。退出后数据随本地链重置。

| 钱包 | PACK 持仓 | 首轮分配 | 演示初始状态 |
| --- | ---: | ---: | --- |
| Alice | 120,000 | 240 | 已开过 1 盒，持有 140 碎片和卡 #4 |
| Bob | 180,000 | 360 | 待领取，适合演示领取和开盒 |
| Carol | 200,000 | 400 | 待领取 |
| Dave | 100,000 | 0 | 刚好等于门槛 |

模拟池收到 4 BNB 买单，发 0.12 BNB 给 Vault。Vault 以 0.01 BNB/张买入 10 张，首轮因此分配 1,000 碎片。Alice 开盒后剩余 9 张卡，金库未使用预算为 0.02 BNB。

1. 切到 Bob，领取 360 碎片。
2. 点击「消耗 100 碎片领取盲盒」，再点击「打开我的盲盒」。本地演示会自动提交模拟揭晓。
3. 检查余额 260、库存减少 1，以及「我的收藏」的新增卡片。
4. 切到 Dave 查看持仓边界。打开「代币发行」可以选择元素伙伴或夜影传说，通过本地 Portal 创建另外一个 Launcher。认购满额、卡册补齐后点击开池。

`npm test` 在独立端口启动临时链，验证工厂开池、模拟税收入库、持仓分红、10 万门槛、排除池子、重复领取、授权揭晓、NFT 交割、超时和认购退款。

## 合约对接

- `src/PackLauncher.sol` — 基于 Flap 的 `LauncherFactoryBase`，Portal 调用 Factory 创建 Launcher。认购资金达标、三种创世卡集齐后，Launcher 调用 `launchTaxTokenV2`。100 万供应中 40 万进入池，60 万按认购金额分配。创世卡按三种图案轮换用于开池进度。
- `src/ShardVaultFactory.sol` — 实现 Flap `pl-v1`，使用原生 BNB 报价，承接 100% 的可分配交易税份额。税率配置为买卖各 3%。Launcher 和 Vault 的 beacon 升级权由指定的 Flap Guardian 持有。
- `src/ShardVault.sol` — 运营方提交完整的持有人名单，合约在发布交易中核对真实持仓并排除池子、Launcher 和 Vault。严格大于 100,000 才合格，按全额持仓计算权重，碎片向下取整，剩余配额可进入后续轮次。库存每增加 1 张，最多增加 100 碎片负债额度。先调用 `claim(roundId)` 领取碎片，再调用 `claimBox()` 消耗 100 碎片并预留一张卡，获得绑定到地址的盲盒。只有持有人可以调用 `openBox(boxId)` 请求揭晓。未打开的盒子可取消，已打开的盒子在随机请求超时 24 小时后可取消。
- `src/demo/Demo.sol` — 本地模拟 Portal、池子、发币、原卡商店和可控随机源。演示随机源由运营方控制，卡片仅供测试。碎片是 Vault 内部通用额度，可以跨期积累。

分红发布者负责名单完整性，合约校验入选地址的余额及唯一性。当前快照区块为发布交易所在区块。测试网脚本从 Token 的 Transfer 日志枚举地址，发布前应重新生成名单，避免漏掉刚出现的合格地址。奖池、随机、分红的完整合约行为已在本地链验收，正式接入需要可验证随机源和真实卡源适配器。

## BSC 测试网参赛流程

1. 在自己的环境注入 `BSC_TESTNET_RPC`、`PACKLAUNCH_TESTNET_KEY` 和无密钥的浏览器 RPC `PACKLAUNCH_PUBLIC_RPC`。使用有 tBNB 的专用测试账户。执行 `npm run testnet -- deploy` 部署两个 Factory、测试卡源和模拟随机适配器，生成前端部署文件和 Launcher 详情 manifest。两个示范系列在链上分别使用独立的 ERC‑721 合约，采购价为测试资金定价。也可用 `PACKLAUNCH_TESTNET_KEY_FILE` 指向本地测试签名密钥。
2. 把两个 Factory 地址交给 Flap，确认 Portal 已启用你的 Factory、原生报价与开池最低门槛。用实际的 Pool Launch 税币实现地址运行 `npm run testnet -- salt <implementation>`，得到符合 7777 尾号要求的 salt，在 UI 填入创建 Launcher。
3. `npm run dev` 启前端，通过 97 链钱包连接。选择 NFT 系列并创建 Launcher，完成认购、集卡、开池和领币。记录 Portal 的创建交易与开池交易，以及 Launcher、Token、池子和 Vault 地址。
4. 用真实测试网 DEX 交易触发税收处理，用 `npm run testnet -- dispatch <vault>` 分发已结算的税，检查 Vault 的 BNB 余额增长，再执行购卡和发布快照。可用 `npm run testnet -- holders <vault> <发币区块>` 生成候选名单并粘贴到运营面板。
5. 玩家领取碎片、领取盲盒，再打开盲盒。测试卡源用部署随机适配器的账户执行 `npm run testnet -- reveal <vault> <requestId>`。保存税收到账、入库、分红、开盒和 NFT 转账的交易。若余额尚未到账，检查 Flap TaxProcessor 的结算条件。
6. 把 `flap-ui/Component.tsx`、`i18n.json` 和生成的 `manifest.json` 交给 Flap Workbench。详情组件基于官方 Launcher Detail 模板。跳转路由 `/apps/packlaunch?launcher=…` 需要在 Flap 注册 Mini App 后使用。独立站可直接按 `?launcher=…` 打开指定发行。

## 上游

- [Flap Pool Launch 合约示例](https://github.com/flap-sh/FlapPoolLaunchVaultExample/tree/29334f689774f6b3a39720b3fc802ab0d6a61718)。`src/flap` 保留其官方定义。
- [Flap Launcher UI 模板](https://github.com/flap-sh/flap-vault-component-template/tree/3a7fa025f7a73dd6b6ff4eecce4e990bf33e1a06/examples/launcher-runtime/launcher-detail-demo)。
- [Solady](https://github.com/Vectorized/solady/tree/258f67cc71e39cff307b726939ade17e9d8bcf5c)。取用文件和许可证位于 `lib/solady`。

## X 晒卡活动 / Card Showcase

页头的「中文 / English」可切换界面语言，偏好保存在浏览器。收藏图鉴的「晒到 X」针对当前钱包持有、且曾入库的卡。测试网先在 X 发布包含完整验证文本的公开帖子，再粘贴帖子链接或 ID。前端向 Flap 公共预言机取得签名证明，`CardShowcase` 核验签名、卡片归属以及活动、Vault、钱包和链的绑定关系。一张卡只能登记一次，同一个帖子也只能提交一次。晒卡登记不消耗碎片或奖池库存。

本地 `npm run demo` 中选择 Alice 对 NFT #4 点击「晒到 X」，用「模拟验证」完成链上登记。模拟模式不向 X 发帖。测试网部署脚本使用 Flap 的 X General Verifier，真实公开帖的签名和提交需要在链 97 上验收。

## Contest evidence

[SUBMISSION.md](SUBMISSION.md) contains the short pitch and an evidence checklist. `npm run test:flap` runs a loopback fork of BSC Testnet against the deployed Pool Launch Portal and DEX. It impersonates the Portal admin inside the fork to exercise factory enablement, and it uses synthetic account balances. Public testnet explorer receipts are recorded separately from fork output. Use a current Anvil release for the deployed Portal, or set `ANVIL_BIN` to a compatible executable.

After deployment, package the generated Flap Workbench artifacts with `cd flap-ui && zip ../packlaunch-launcher-ui.zip Component.tsx i18n.json manifest.json`.
