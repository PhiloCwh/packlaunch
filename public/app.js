import {
  AbiCoder, BrowserProvider, Contract, JsonRpcProvider, ZeroAddress,
  formatEther, getAddress, hexlify, isHexString, parseEther, randomBytes
} from '/ethers.js';

const $ = id => document.getElementById(id);
const MINIMUM = parseEther('100000');
const PORTAL_EVENT = 'event FlapNewLauncherCreated(address launcher,address launcherFactory,address creator,string description)';
const formatInt = value => new Intl.NumberFormat(language === 'en' ? 'en' : 'zh-CN').format(value);
const short = address => address ? address.slice(0, 6) + '…' + address.slice(-4) : '—';
const set = (id, value) => { $(id).textContent = value; };
const sameAddress = (a, b) => a?.toLowerCase() === b?.toLowerCase();
const launchTab = name => {
  for (const button of document.querySelectorAll('[data-tab]')) {
    if (button.dataset.tab === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('rewards-panel').hidden = name !== 'rewards';
  $('launch-panel').hidden = name !== 'launch';
};

let config, abi, rpc, signer, player, launcher, vault, view = {}, loading = false;
let selection;
let refreshSequence = 0;

const translations = {
  "NFT 系列": "NFT collection",
  "晒到 X": "Showcase on X",
  "已晒卡": "Showcased",
  "本地模拟验证，不会发布 X 帖子。": "Local simulation. No post is published to X.",
  "发帖时可以附上卡片截图，请保留下方完整验证文本。": "Attach a card screenshot if you like and keep the complete verification text below.",
  "模拟验证": "Simulate proof",
  "正在验证…": "Verifying…",
  "晒卡证明已上链": "Showcase proof recorded on-chain",
  "请输入有效的公开 X 帖子链接或数字 ID。": "Enter a valid public X post URL or numeric ID.",
  "Flap 暂时无法验证这条帖子。请确认帖子公开且包含完整验证文本。": "Flap could not verify this post. Check that it is public and contains the complete verification text.",
  "预言机返回了不匹配的证明。": "The oracle returned a mismatched proof.",

  "碎片金库": "Shard Vault",
  "代币发行": "Token Launch",
  "正在连接": "Connecting",
  "连接钱包": "Connect Wallet",
  "收藏赛季": "Collection Season",
  "持有超过 100,000 PACK，按持仓领取碎片。每 100 枚可开一次盲盒。": "Hold over 100,000 PACK to earn shards in proportion to your holdings. Redeem 100 for one blind box.",
  "火系": "Fire",
  "水系": "Water",
  "草系": "Grass",
  "我的 PACK 持仓": "My PACK holdings",
  "等待钱包": "Waiting for wallet",
  "本期可领": "Claimable this round",
  "等待快照": "Waiting for snapshot",
  "我的碎片": "My shards",
  "每 100 碎片开一次": "100 shards per box",
  "可抽奖池": "Available cards",
  "等待金库": "Waiting for vault",
  "碎片分红": "Shard Dividends",
  "按快照时的合格持仓分配": "Allocated by eligible holdings at snapshot",
  "轮次 / 快照": "Round / Snapshot",
  "奖励操作": "Action",
  "连接钱包后查看领取记录。": "Connect a wallet to view rewards.",
  "开一盒": "Open a Box",
  "领取盲盒，打开后随机获得一张卡": "Claim a blind box and open it for a random card",
  "0 / 100 碎片": "0 / 100 shards",
  "0 次可抽": "0 boxes available",
  "消耗 100 碎片开盒": "Open for 100 shards",
  "打开我的盲盒": "Open my blind box",
  "模拟揭晓": "Simulate reveal",
  "退回碎片": "Return shards",
  "收藏图鉴": "Collection",
  "当前钱包的开盒记录": "Cards opened by this wallet",
  "金库运营": "Vault Operations",
  "用税款购入一张卡": "Buy a card with tax funds",
  "模拟一笔 4 BNB 买入": "Simulate a 4 BNB buy",
  "快照名单，每行一个地址": "Snapshot addresses, one per line",
  "发布碎片分红": "Publish shard dividends",
  "集齐卡册开池": "Complete the Album to Launch",
  "募集资金达到目标，创世卡册也集齐后，由 Launcher 在 Flap Portal 创建代币与流动性池。": "Reach the funding goal and complete the genesis album to create the token and pool through Flap Portal.",
  "发行进度": "Launch Progress",
  "暂无 Launcher": "No launcher selected",
  "认购金额 (BNB)": "Contribution (BNB)",
  "认购并揭晓创世卡": "Contribute and reveal a genesis card",
  "补齐卡册": "Complete album",
  "开池": "Launch pool",
  "领取 PACK": "Claim PACK",
  "退款": "Refund",
  "创建新发行": "Create a Launch",
  "代币名": "Token name",
  "代币符号": "Token symbol",
  "元数据 CID": "Metadata CID",
  "发行目标 (BNB)": "Funding goal (BNB)",
  "认购时长 (小时)": "Contribution window (hours)",
  "Flap 发行 Salt": "Flap launch salt",
  "通过 Portal 创建": "Create via Portal",
  "盲盒正在打开": "Opening blind box",
  "等待链上揭晓": "Waiting for on-chain reveal",
  "晒卡活动": "Card Showcase",
  "发帖内容": "Post text",
  "在 X 发帖": "Post on X",
  "公开帖子链接或 ID": "Public post URL or ID",
  "验证晒卡": "Verify showcase",
  "PackLaunch 首页": "PackLaunch home",
  "主导航": "Main navigation",
  "演示钱包": "Demo wallet",
  "火、水、草三种原创收藏生物": "Three original fire, water and grass creatures",
  "关闭开盒特效": "Close reveal",
  "关闭晒卡": "Close showcase",
  "本地演示可留空": "Optional in local demo",
  "烬尾": "Embertail",
  "潮角": "Tidehorn",
  "苔芽": "Mossbud",
  "正在揭晓": "Revealing",
  "开盒成功": "Box opened",
  "获得收藏卡": "Card unlocked",
  "等待链上结果，可关闭此窗口。": "Waiting for the on-chain result. You may close this dialog.",
  " 已到账": " received",
  "等待钱包和代币": "Waiting for wallet and token",
  "当前持仓达标": "Current balance qualifies",
  "当前持仓不符合分红资格": "Current balance is below the threshold",
  " 枚": " shards",
  "快照区块 #": "Snapshot block #",
  "等待碎片分红": "Waiting for dividends",
  " 张": " cards",
  "未使用预算 ": "Unspent budget ",
  " 次可抽": " boxes available",
  " / 100 碎片": " / 100 shards",
  "消耗 100 碎片领取盲盒": "Claim blind box for 100 shards",
  "已发到你的地址，等待开盒": "Assigned to your address and ready to open",
  "已到期，可退回碎片": "Expired. Shards can be returned.",
  "等待随机结果": "Waiting for randomness",
  "盲盒 #": "Box #",
  "暂无可展示的分红轮次。": "No dividend rounds to display.",
  "第 ": "Round ",
  " 期": "",
  "区块 #": "Block #",
  "可领 ": "Claim ",
  "暂无可领碎片": "No shards to claim",
  "领碎片": "Claim shards",
  "已领取 ": "Claimed ",
  "还没有开盒记录。": "No cards opened yet.",
  "已开池": "Pool live",
  "认购中": "Funding open",
  "资金已达标": "Funding goal reached",
  "已截止": "Closed",
  "星轨": "Startrail",
  "棱镜": "Prism",
  "极光": "Aurora",
  "当前浏览器没有检测到 EVM 钱包。": "No EVM wallet detected in this browser.",
  "请在钱包切换到链 ID ": "Switch your wallet to chain ID ",
  " 后重新连接。": " and reconnect.",
  "等待确认 · ": "Awaiting confirmation · ",
  "请先连接钱包。": "Connect your wallet first.",
  "正在提交交易…": "Submitting transaction…",
  "盲盒已发到你的地址，准备好后打开": "Blind box assigned to your address. Open it when ready.",
  "已锁定 100 枚碎片，等待揭晓": "100 shards locked. Waiting for reveal.",
  "获得收藏卡 #": "Received card #",
  "盲盒已打开，可点击「模拟揭晓」重试": "Box opened. Use Simulate reveal to retry.",
  "盲盒已打开，等待揭晓": "Box opened. Waiting for reveal.",
  "已退回 100 枚碎片": "100 shards returned.",
  "一张收藏卡已入库": "One card was added to the vault.",
  "模拟买入完成，金库收到 0.12 BNB 交易税": "Simulated buy complete. The vault received 0.12 BNB in tax.",
  "碎片分红已发布": "Shard dividend round published.",
  "创世卡册已补齐": "Genesis album completed.",
  "已发币并创建流动性池": "Token and liquidity pool created.",
  "认购代币已到账": "Contribution tokens received.",
  "认购款已退回": "Contribution refunded.",
  "创世包已开启 · ": "Genesis pack opened · ",
  "请输入有效的 32 字节 Flap 发行 Salt。": "Enter a valid 32-byte Flap launch salt.",
  "Flap 尚未启用这个 Launcher Factory。": "Flap has not enabled this Launcher Factory.",
  "交易已确认，未读取到创建事件。": "The transaction confirmed but no creation event was found.",
  "Launcher 已创建 · ": "Launcher created · ",
  "缺少部署配置，请启动 npm run demo 或写入测试网部署配置。": "Deployment config missing. Run npm run demo or configure testnet.",
  "本地链 · 模拟演示": "Local chain · Demo",
  "BSC 测试网 · 模拟卡源": "BSC Testnet · Demo cards",
  "BSC 测试网": "BSC Testnet",
  "连接失败": "Connection failed"
};

const languageControl = $('language');
let language = localStorage.getItem('packlaunch-language') === 'en' ? 'en' : 'zh';
const t = text => language === 'en' ? (translations[text] ?? text) : text;
function applyLanguage() {
  languageControl.value = language;
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.title = language === 'en' ? 'PackLaunch · Shards & Boxes' : 'PackLaunch · 碎片盲盒';
  for (const node of document.querySelectorAll('[data-i18n]')) node.firstChild.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', t(node.dataset.i18nAria));
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
  if (config) {
    updateNetwork();
    updateCollections();
    set('connect', player ? short(player) : t('连接钱包'));
    render(view);
  }
}
languageControl.addEventListener('change', () => {
  language = languageControl.value;
  localStorage.setItem('packlaunch-language', language);
  applyLanguage();
  set('notice', '');
});

function contract(name, address, runner = rpc) {
  return new Contract(address, abi[name], runner);
}

function dom(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const species = [
  { kind: 'fire', name: "烬尾", element: "火系" },
  { kind: 'water', name: "潮角", element: "水系" },
  { kind: 'leaf', name: "苔芽", element: "草系" }
];

function cardTile(card) {
  const { kind, name, element } = species[Number((card - 1n) % 3n)];
  const tile = dom('article', undefined, 'collectible ' + kind);
  const header = dom('div', undefined, 'card-header');
  header.append(dom('strong', t(name)), dom('span', t(element), 'type-tag'));
  const art = dom('div', undefined, 'card-art');
  art.append(dom('span', undefined, 'creature ' + kind));
  tile.append(header, art, dom('small', 'NFT #' + card));
  return tile;
}

let sharing;

function updateShareLabels() {
  set('share-mode', config.demo
    ? t('本地模拟验证，不会发布 X 帖子。')
    : t('发帖时可以附上卡片截图，请保留下方完整验证文本。'));
  set('share-verify', config.demo ? t('模拟验证') : t('验证晒卡'));
}

async function openShare(card) {
  const campaign = contract('CardShowcase', view.campaign, signer);
  const current = { card, campaign, vaultAddress: await vault.getAddress(), account: player };
  current.challenge = await campaign.challenge(current.account, current.vaultAddress, card);
  sharing = current;
  set('share-card', 'NFT #' + card);
  set('share-status', '');
  $('share-url').value = '';
  $('share-url').hidden = config.demo;
  $('share-form').querySelector('label').hidden = config.demo;
  $('share-post').hidden = config.demo;
  $('share-text').value = current.challenge + ' #PackLaunch';
  $('share-post').href = 'https://x.com/intent/tweet?text=' + encodeURIComponent($('share-text').value);
  $('share-verify').disabled = false;
  updateShareLabels();
  $('share-dialog').showModal();
}

function parseTweet(value) {
  const input = value.trim();
  if (/^[1-9][0-9]{0,19}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.protocol === 'https:' && /^(www\.)?(x|twitter)\.com$/i.test(url.hostname)) {
      const match = url.pathname.match(/\/status\/([1-9][0-9]{0,19})(?:\/|$)/);
      if (match) return match[1];
    }
  } catch {
    // Report the same validation error for malformed URLs and unsupported hosts.
  }
  throw new Error(t('请输入有效的公开 X 帖子链接或数字 ID。'));
}

async function shareProof(current) {
  if (config.demo) {
    const id = BigInt(hexlify(randomBytes(12)));
    const proof = [id, 'packlaunch_demo', 1n, current.challenge];
    const operator = await rpc.getSigner(config.operator);
    await send(contract('DemoXVerifier', config.xVerifier, operator).approveProof(proof));
    return { proof, signature: '0x' };
  }
  const tweet = parseTweet($('share-url').value);
  const response = await fetch('https://verifyx.taxed.fun/prove?chain_id=' + config.chainId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tweet_id: tweet, substring: current.challenge })
  });
  if (!response.ok) throw new Error(t('Flap 暂时无法验证这条帖子。请确认帖子公开且包含完整验证文本。'));
  const result = await response.json();
  if (result.tweet_id !== tweet || Number(result.chain_id) !== config.chainId
    || !sameAddress(result.verifier_address, config.xVerifier) || result.substring !== current.challenge) {
    throw new Error(t('预言机返回了不匹配的证明。'));
  }
  return { proof: [result.tweet_id, result.x_handle, result.x_id, result.substring], signature: result.signature };
}

$('share-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!sharing || $('share-verify').disabled) return;
  const current = sharing;
  $('share-verify').disabled = true;
  set('share-status', t('正在验证…'));
  try {
    const { proof, signature } = await shareProof(current);
    if (sharing !== current || !$('share-dialog').open || !sameAddress(current.account, player)) return;
    await send(current.campaign.showcase(current.vaultAddress, current.card, proof, signature));
    const message = t('晒卡证明已上链');
    set('share-status', message);
    set('notice', message);
    await refresh();
  } catch (error) {
    set('share-status', error.reason || error.shortMessage || error.message);
    if (sharing === current) $('share-verify').disabled = false;
  }
});

function showTheater(card) {
  const theater = $('box-theater');
  theater.classList.toggle('won', card !== undefined);
  $('theater-card').hidden = card === undefined;
  $('theater-card').replaceChildren();
  if (card !== undefined) $('theater-card').append(cardTile(card));
  set('theater-stage', card === undefined ? t("正在揭晓") : t("开盒成功"));
  set('theater-title', card === undefined ? t("盲盒正在打开") : t("获得收藏卡"));
  set('theater-detail', card === undefined ? t("等待链上结果，可关闭此窗口。") : 'NFT #' + card + t(" 已到账"));
  if (!theater.open) theater.showModal();
}

$('theater-close').addEventListener('click', () => $('box-theater').close());

function setLauncher(address) {
  selection = address;
  launcher = address ? contract('PackLauncher', address) : undefined;
  const url = new URL(location.href);
  if (address) url.searchParams.set('launcher', address);
  else url.searchParams.delete('launcher');
  history.replaceState(null, '', url);
}

function render(state) {
  const { settings, raised, mask = 0n, contribution = 0n, didClaim, tokenAddress, vaultAddress, latest, balance,
    fragments = 0n, count = 0n, pendingCount = 0n, requestId, requestDeadline, sealed, now, tax, cards = [], rounds = [] } = state;
  const eligible = balance !== undefined && balance > MINIMUM && ![state.pool, selection, vaultAddress]
    .some(address => sameAddress(address, player));
  const available = count - pendingCount;
  const ready = fragments / 100n < available ? fragments / 100n : available;
  set('holding', balance === undefined ? '—' : formatInt(balance / (10n ** 18n)));
  set('eligible', balance === undefined ? t("等待钱包和代币") : eligible ? t("当前持仓达标") : t("当前持仓不符合分红资格"));
  $('eligible').classList.toggle('good', eligible);
  set('latest-claim', latest ? formatInt(latest.amount) + t(" 枚") : '—');
  set('snapshot', latest ? t("快照区块 #") + latest.block : t("等待碎片分红"));
  set('fragments', vault ? formatInt(fragments) + t(" 枚") : '—');
  set('inventory', vault ? formatInt(available) + t(" 张") : '—');
  set('tax', vault ? t("未使用预算 ") + formatEther(tax) + ' BNB' : t("等待金库"));
  set('boxes', ready + t(" 次可抽"));
  const progress = fragments >= 100n ? 100 : Number(fragments);
  $('progress').value = progress;
  set('progress-label', progress + t(" / 100 碎片"));
  $('open').disabled = loading || !signer || ready === 0n || Boolean(requestId);
  set('open', config.sealedBoxes ? t("消耗 100 碎片领取盲盒") : t("消耗 100 碎片开盒"));
  $('pending').hidden = !requestId;
  $('reveal').hidden = !config.demo || Boolean(sealed);
  $('open-box').hidden = !sealed;
  $('open-box').disabled = loading || !signer;
  if (requestId) {
    const status = sealed ? t("已发到你的地址，等待开盒") : now >= requestDeadline ? t("已到期，可退回碎片") : t("等待随机结果");
    set('pending-copy', t("盲盒 #") + requestId + ' · ' + status);
    $('reveal').disabled = loading || now >= requestDeadline;
    $('cancel').disabled = loading || (!sealed && now < requestDeadline);
  }

  $('rounds').replaceChildren();
  if (!rounds.length) {
    $('rounds').append(dom('div', player ? t("暂无可展示的分红轮次。") : t("连接钱包后查看领取记录。")));
  }
  for (const round of rounds) {
    const row = dom('div', undefined, 'round-row');
    const info = dom('div');
    info.append(dom('strong', t("第 ") + round.id + t(" 期")), dom('small', t("区块 #") + round.block + ' · '
      + (round.amount ? t("可领 ") + round.amount + t(" 枚") : t("暂无可领碎片"))));
    const button = dom('button', t("领碎片"), 'secondary');
    button.disabled = loading || !signer || round.amount === 0n;
    button.addEventListener('click', () => transaction(async () => {
      await send(vault.connect(signer).claim(round.id));
      return t("已领取 ") + round.amount + ' 枚碎片';
    }));
    row.append(info, button);
    $('rounds').append(row);
  }

  $('collection').replaceChildren();
  if (!cards.length) $('collection').append(dom('div', t("还没有开盒记录。"), 'empty'));
  for (const card of cards) {
    const tile = cardTile(card);
    if (state.campaign) {
      const tweet = state.showcased?.get(card);
      const button = dom('button', tweet ? t('已晒卡') : t('晒到 X'), 'secondary card-share');
      button.disabled = Boolean(tweet) || !signer || loading;
      button.addEventListener('click', () => openShare(card).catch(error => set('notice', error.shortMessage || error.message)));
      tile.append(button);
    }
    $('collection').append(tile);
  }

  const launched = Boolean(tokenAddress && tokenAddress !== ZeroAddress);
  const saleOpen = Boolean(settings && now < state.deadline && raised < settings.target && !launched);
  const funded = Boolean(settings && raised === settings.target);
  const canLaunch = funded && now < state.deadline + 604800n && !launched;
  set('launch-info', settings
    ? settings.name + ' (' + settings.symbol + ') · ' + formatEther(raised) + ' / ' + formatEther(settings.target) + ' BNB · '
      + (launched ? t("已开池") : saleOpen ? t("认购中") : canLaunch ? t("资金已达标") : t("已截止"))
    : t("暂无 Launcher"));
  $('launch-collection').hidden = !state.collection;
  if (state.collection) {
    set('launch-collection', t('NFT 系列') + ' · ' + collectionLabel(state.collection) + ' · ' + short(state.collection.address));
  }
  $('album').replaceChildren(...[t("星轨"), t("棱镜"), t("极光")].map((name, i) =>
    dom('span', ((mask & (1n << BigInt(i))) > 0n ? '✓ ' : '') + name, mask & (1n << BigInt(i)) ? 'found' : '')));
  $('contribute-form').querySelector('button').disabled = loading || !signer || !saleOpen;
  $('create-form').querySelector('button').disabled = loading || !signer;
  $('complete').disabled = loading || !signer || !canLaunch || mask === 7n || contribution === 0n;
  $('launch').disabled = loading || !signer || !canLaunch || mask !== 7n;
  $('claim-token').disabled = loading || !signer || !launched || didClaim || contribution === 0n;
  $('refund').disabled = loading || !signer || launched || contribution === 0n || !settings ||
    now < state.deadline || (funded && now < state.deadline + 604800n);
  const operator = config.demo || sameAddress(player, state.operator);
  $('operator-panel').hidden = !vault || !operator;
  $('trade').hidden = !config.demo;
  for (const id of ['stock', 'publish', 'trade']) $(id).disabled = loading || !signer || !vault;
  set('contract-label', vaultAddress && vaultAddress !== ZeroAddress ? 'Vault ' + vaultAddress : selection ? 'Launcher ' + selection : '');
}

async function refresh() {
  const version = ++refreshSequence;
  const account = player ?? ZeroAddress;
  const currentLauncher = launcher;
  const latestBlock = await rpc.getBlock('latest');
  const next = { now: BigInt(latestBlock.timestamp), account, launcherAddress: selection };
  let nextVault;
  if (currentLauncher) {
    const [settings, raised, mask, contribution, didClaim, tokenAddress, pool, vaultAddress, deadline] = await Promise.all([
      currentLauncher.config(), currentLauncher.raised(), currentLauncher.albumMask(), currentLauncher.contributions(account),
      currentLauncher.claimed(account), currentLauncher.token(), currentLauncher.pool(), currentLauncher.vault(), currentLauncher.deadline()
    ]);
    Object.assign(next, { settings, raised, mask, contribution, didClaim, tokenAddress, pool, vaultAddress, deadline });
    next.collection = config.collections?.find(entry => sameAddress(entry.address, settings.collection));
    next.campaign = next.collection?.showcase ?? config.showcase;
    if (vaultAddress !== ZeroAddress) {
      nextVault = contract('ShardVault', vaultAddress);
      const token = contract('DemoToken', tokenAddress);
      const [lastRound, count, pendingCount, tax, operator] = await Promise.all([
        nextVault.round(), nextVault.inventoryCount(), nextVault.pendingCount(), rpc.getBalance(vaultAddress), nextVault.operator()
      ]);
      Object.assign(next, { count, pendingCount, tax, operator });
      if (player) {
        const [balance, fragments, requestId, cards] = await Promise.all([
          token.balanceOf(account), nextVault.fragments(account), nextVault.activeRequest(account), nextVault.wonCards(account)
        ]);
        Object.assign(next, { balance, fragments, requestId, cards });
        if (next.campaign && cards.length) {
          const campaign = contract('CardShowcase', next.campaign);
          next.showcased = new Map(await Promise.all(cards.map(async card => [card, await campaign.showcasedTweet(card)])));
        }
        if (requestId) {
          next.requestDeadline = (await nextVault.requests(requestId)).deadline;
          next.sealed = Boolean(config.sealedBoxes && next.requestDeadline === 0n);
        }
        const ids = Array.from({ length: Number(lastRound) }, (_, index) => lastRound - BigInt(index));
        next.rounds = [];
        // Keep older unclaimed rounds reachable while limiting concurrent calls.
        for (let i = 0; i < ids.length; i += 20) {
          const page = await Promise.all(ids.slice(i, i + 20).map(async id => {
            const [amount, block] = await Promise.all([nextVault.claimable(id, account), nextVault.snapshotBlock(id)]);
            return { id, amount, block };
          }));
          next.rounds.push(...page.filter((round, index) => (i === 0 && index === 0) || round.amount > 0n));
        }
        next.latest = next.rounds[0];
      }
    }
  }
  if (version !== refreshSequence) return;
  vault = nextVault;
  const newCard = view.account === next.account && view.launcherAddress === next.launcherAddress
    && view.requestId && (next.cards?.length ?? 0) > (view.cards?.length ?? 0);
  view = next;
  if (newCard) showTheater(next.cards.at(-1));
  render(view);
}

async function selectDemo(address) {
  signer = await rpc.getSigner(address);
  player = signer.address;
}

async function connectWallet() {
  if (!window.ethereum) throw new Error(t("当前浏览器没有检测到 EVM 钱包。"));
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  const provider = new BrowserProvider(window.ethereum);
  const net = await provider.getNetwork();
  if (net.chainId !== BigInt(config.chainId)) {
    throw new Error(t("请在钱包切换到链 ID ") + config.chainId + t(" 后重新连接。"));
  }
  signer = await provider.getSigner();
  player = await signer.getAddress();
  set('connect', short(player));
  await refresh();
}

async function send(action) {
  const result = await action;
  set('notice', t("等待确认 · ") + short(result.hash));
  return result.wait();
}

async function transaction(action) {
  if (loading) return;
  if (!signer) {
    set('notice', t("请先连接钱包。"));
    return;
  }
  loading = true;
  render(view);
  set('notice', t("正在提交交易…"));
  try {
    const message = await action();
    set('notice', message);
    await refresh();
  } catch (error) {
    set('notice', error.reason || error.shortMessage || error.message || String(error));
  } finally {
    loading = false;
    render(view);
  }
}

for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => launchTab(button.dataset.tab));

$('connect').addEventListener('click', () => connectWallet().catch(error => set('notice', error.message)));
$('accounts').addEventListener('change', async event => {
  if (loading) { event.target.value = player; return; }
  try {
    await selectDemo(event.target.value);
    set('notice', '');
    await refresh();
  } catch (error) { set('notice', error.message); }
});

const bind = (id, fn) => $(id).addEventListener('click', () => transaction(fn));
bind('open', async () => {
  const playerVault = vault.connect(signer);
  if (config.sealedBoxes) {
    await send(playerVault.claimBox());
    return t("盲盒已发到你的地址，准备好后打开");
  }
  await send(playerVault.open());
  if (!config.demo) showTheater();
  return t("已锁定 100 枚碎片，等待揭晓");
});
async function revealDemo(requestId) {
  showTheater();
  const admin = await rpc.getSigner(config.operator);
  const random = contract('DemoRandom', config.random, admin);
  try {
    const receipt = await send(random.reveal(await vault.getAddress(), requestId, BigInt(hexlify(randomBytes(32)))));
    const winner = receipt.logs.map(log => {
      try { return vault.interface.parseLog(log); } catch { return null; }
    }).find(log => log?.name === 'CardWon');
    return t("获得收藏卡 #") + winner.args.card;
  } catch (error) {
    $('box-theater').close();
    throw error;
  }
}

bind('open-box', async () => {
  const requestId = view.requestId;
  await send(vault.connect(signer).openBox(requestId));
  showTheater();
  if (config.demo) {
    // Give the opening effect time to play before the local adapter returns a result.
    await new Promise(resolve => setTimeout(resolve, 450));
    try {
      return await revealDemo(requestId);
    } catch {
      return t("盲盒已打开，可点击「模拟揭晓」重试");
    }
  }
  return t("盲盒已打开，等待揭晓");
});
bind('cancel', async () => {
  await send(vault.connect(signer).cancel(view.requestId));
  $('box-theater').close();
  return t("已退回 100 枚碎片");
});
bind('reveal', () => revealDemo(view.requestId));
bind('stock', async () => {
  const shop = contract('DemoCards', await vault.shop());
  await send(vault.connect(signer).stock(await shop.price()));
  return t("一张收藏卡已入库");
});
bind('trade', async () => {
  await send(contract('DemoPool', view.pool, signer).buy({ value: parseEther('4') }));
  return t("模拟买入完成，金库收到 0.12 BNB 交易税");
});
bind('publish', async () => {
  const operator = config.demo ? await rpc.getSigner(view.operator) : signer;
  const holders = $('holders').value.trim().split(/\s+/).filter(Boolean).map(value => getAddress(value).toLowerCase()).sort();
  await send(vault.connect(operator).publishRound(holders));
  return t("碎片分红已发布");
});
bind('complete', async () => { await send(launcher.connect(signer).completeAlbum()); return t("创世卡册已补齐"); });
bind('launch', async () => { await send(launcher.connect(signer).launch()); return t("已发币并创建流动性池"); });
bind('claim-token', async () => { await send(launcher.connect(signer).claim()); return t("认购代币已到账"); });
bind('refund', async () => { await send(launcher.connect(signer).refund()); return t("认购款已退回"); });

$('contribute-form').addEventListener('submit', event => {
  event.preventDefault();
  transaction(async () => {
    const receipt = await send(launcher.connect(signer).contribute({ value: parseEther($('contribution').value) }));
    const pack = receipt.logs.map(log => {
      try { return launcher.interface.parseLog(log); } catch { return null; }
    }).find(log => log?.name === 'PackOpened');
    return t("创世包已开启 · ") + [t("星轨"), t("棱镜"), t("极光")][Number(pack.args.card)];
  });
});

$('create-form').addEventListener('submit', event => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  transaction(async () => {
    const entered = fields.get('salt').trim();
    const salt = entered || (config.demo ? hexlify(randomBytes(32)) : '');
    if (!isHexString(salt, 32)) throw new Error(t("请输入有效的 32 字节 Flap 发行 Salt。"));
    const portal = new Contract(config.hub, [...abi.IPortal, PORTAL_EVENT], signer);
    const [enabled] = await portal.launcherFactoryMultiplier(config.factory);
    if (!enabled) throw new Error(t("Flap 尚未启用这个 Launcher Factory。"));
    const fieldsToEncode = [
      fields.get('name'), fields.get('symbol'), fields.get('meta'), salt, parseEther(fields.get('target')), BigInt(fields.get('hours')) * 3600n
    ];
    let tuple = 'tuple(string,string,string,bytes32,uint256,uint256';
    if (config.collections) {
      tuple += ',address';
      fieldsToEncode.push(getAddress(fields.get('collection')));
    }
    const data = AbiCoder.defaultAbiCoder().encode([tuple + ')'], [fieldsToEncode]);
    const receipt = await send(portal.newLauncher(config.factory, data, { value: await portal.SALT_LOCK_FEE() }));
    const created = receipt.logs.map(log => {
      try { return portal.interface.parseLog(log); } catch { return null; }
    }).find(log => log?.name === 'FlapNewLauncherCreated');
    if (!created) throw new Error(t("交易已确认，未读取到创建事件。"));
    setLauncher(created.args.launcher);
    return t("Launcher 已创建 · ") + created.args.launcher;
  });
});

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(t("缺少部署配置，请启动 npm run demo 或写入测试网部署配置。"));
  return response.json();
}

function collectionLabel(entry) {
  return language === 'en' ? entry.name : entry.zh;
}

function updateCollections() {
  if (!config.collections?.length) return;
  const input = $('launch-collection-input');
  const previous = input.value;
  input.replaceChildren(...config.collections.map(entry => {
    const option = dom('option', collectionLabel(entry) + ' · ' + short(entry.address));
    option.value = entry.address;
    return option;
  }));
  if (previous) input.value = previous;
  $('collection-field').hidden = false;
}

function updateNetwork() {
  set('network', config.demo ? t("本地链 · 模拟演示") : config.mockCards ? t("BSC 测试网 · 模拟卡源") : t("BSC 测试网"));
}

async function initialize() {
  [config, abi] = await Promise.all([json('/deployment.json'), json('/abis.json')]);
  rpc = new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true, cacheTimeout: -1 });
  updateNetwork();
  updateCollections();
  if (config.demo) {
    $('connect').hidden = true;
    $('accounts').hidden = false;
    for (const account of config.accounts) {
      const option = dom('option', account.label + ' · ' + short(account.address));
      option.value = account.address;
      $('accounts').append(option);
    }
    await selectDemo(config.accounts[0].address);
    $('holders').value = config.accounts.slice(0, 3).map(account => account.address).join('\n');
  } else {
    window.ethereum?.on?.('accountsChanged', () => location.reload());
    window.ethereum?.on?.('chainChanged', () => location.reload());
  }
  const address = new URLSearchParams(location.search).get('launcher') || config.launcher;
  if (address) setLauncher(getAddress(address));
  await refresh();
  setInterval(() => {
    if (!loading) refresh().catch(error => set('notice', error.shortMessage || error.message));
  }, 8000);
}

applyLanguage();
initialize().catch(error => {
  set('network', t("连接失败"));
  set('notice', error.shortMessage || error.message);
});
