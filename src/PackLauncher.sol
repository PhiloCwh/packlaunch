// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LauncherFactoryBase} from "./flap/LauncherFactoryBase.sol";
import {LauncherBase} from "./flap/LauncherBase.sol";
import {LauncherDescription} from "./flap/LauncherHelper.sol";
import {LauncherDataSchema, FieldDescriptor} from "./flap/IVaultSchemas.sol";
import {IPortal, IPortalTypes} from "./flap/IPortal.sol";
import {LaunchExtensionHelper} from "./flap/LaunchExtensionHelper.sol";
import {Distribution, DistributionTarget} from "./flap/Distribution.sol";
import {IStrategy} from "./flap/IStrategy.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";
import {ShardVault} from "./ShardVault.sol";

interface ICollectionRegistry {
    function shopFor(address collection) external view returns (address);
}

struct PackConfig {
    string name;
    string symbol;
    string meta;
    bytes32 salt;
    uint256 target;
    uint256 duration;
    address collection;
}

contract PackLauncher is LauncherBase, IStrategy {
    using SafeTransferLib for address;

    uint256 public constant TOTAL = 1_000_000 ether;
    uint256 public constant POOL = 400_000 ether;
    uint256 public constant RESERVE = TOTAL - POOL;

    address public hub;
    address public creator;
    address public vaultFactory;
    address public token;
    address public pool;
    address public vault;
    uint256 public deadline;
    uint256 public raised;
    uint8 public albumMask;
    uint256 public packs;
    bool private launching;
    PackConfig public config;
    mapping(address => uint256) public contributions;
    mapping(address => bool) public claimed;

    event PackOpened(address indexed player, uint8 indexed card);
    event Launched(address indexed token, address indexed pool, address indexed vault);

    constructor() { hub = address(1); }

    function initialize(address hub_, address creator_, address vaultFactory_, PackConfig calldata c) external payable {
        require(hub == address(0) && c.target > 0 && c.target <= type(uint128).max && c.duration > 0, "Invalid config");
        require(bytes(c.name).length > 0 && bytes(c.name).length <= 48, "Invalid name");
        require(bytes(c.symbol).length > 0 && bytes(c.symbol).length <= 12 && c.duration <= 30 days, "Invalid symbol or duration");
        hub = hub_;
        creator = creator_;
        vaultFactory = vaultFactory_;
        config = c;
        deadline = block.timestamp + c.duration;
        require(msg.value == IPortal(hub).SALT_LOCK_FEE(), "Incorrect salt fee");
        IPortal(hub).lockSalt{value: msg.value}(c.salt, 0);
    }

    function _getHub() internal view override returns (address) { return hub; }

    function _description() internal view override returns (LauncherDescription memory) {
        return LauncherDescription(config.name, config.symbol, address(0), config.target, 0.4 ether,
            unicode"集齐卡册开池", "Complete the album to launch",
            unicode"认购获得创世卡，资金和卡册双达标后开池。", "Fill the raise and complete the album to launch.");
    }

    function contribute() external payable {
        require(block.timestamp < deadline && msg.value > 0 && !launching, "Sale closed");
        require(raised + msg.value <= config.target, "Target exceeded");
        raised += msg.value;
        contributions[msg.sender] += msg.value;
        // Cycles deterministically through three genesis designs. Prize draws use a separate adapter.
        uint8 card = uint8(packs++ % 3);
        albumMask |= uint8(1 << card);
        emit PackOpened(msg.sender, card);
    }

    function completeAlbum() external {
        require(raised == config.target && contributions[msg.sender] > 0 && albumMask != 7 && !launching, "Album unavailable");
        albumMask = 7;
    }

    function launch() external {
        require(!launching && token == address(0) && raised == config.target && albumMask == 7
            && block.timestamp < deadline + 7 days, "Launch unavailable");
        launching = true;
        IPortalTypes.CreateTaxTokenParams memory p;
        p.name = config.name;
        p.symbol = config.symbol;
        p.meta = config.meta;
        p.salt = config.salt;
        p.totalSupply = TOTAL;
        p.poolQuote = config.target;
        p.poolToken = POOL;
        p.buyTaxRate = 300;
        p.sellTaxRate = 300;
        p.taxDuration = 30 days;
        p.antiFarmerDuration = 1 days;
        p.exemptAddrs = new address[](0);
        p.feeConfigs = new IPortalTypes.FeeConfig[](1);
        p.feeConfigs[0] = IPortalTypes.FeeConfig(IPortalTypes.FeeSlotType.VAULT, 10_000,
            abi.encode(IPortalTypes.FeeConfigVault(vaultFactory, abi.encode(address(this), creator, config.collection))));
        (p.extensionID, p.extensionData) = LaunchExtensionHelper.encodeCreator(creator);
        Distribution memory distribution = Distribution(DistributionTarget.EXPLICIT, address(this), uint128(RESERVE), "");
        IPortalTypes.CreatorBuyParams memory firstBuy;
        (address issued, address pair) = IPortal(hub).launchTaxTokenV2{value: config.target}(p, distribution, firstBuy);
        require(token == issued && issued != address(0), "Distribution missing");
        pool = pair;
        (vault,) = IPortal(hub).getLaunchVault(token);
        ShardVault(payable(vault)).setPool(pair);
        launching = false;
        emit Launched(token, pool, vault);
    }

    function initializeDistribution(address issued, uint256 amount, bytes calldata, bytes32) external override onlyHub {
        require(launching && token == address(0) && amount == RESERVE, "Invalid distribution");
        token = issued;
        issued.safeTransferFrom(msg.sender, address(this), amount);
        emit FlapDistributionInitialized(issued, amount);
    }

    function claim() external {
        require(vault != address(0) && !launching && !claimed[msg.sender] && contributions[msg.sender] > 0, "Claim unavailable");
        claimed[msg.sender] = true;
        token.safeTransfer(msg.sender, RESERVE * contributions[msg.sender] / config.target);
    }

    function refund() external {
        require(!launching && token == address(0) && contributions[msg.sender] > 0, "Refund unavailable");
        require(block.timestamp >= deadline && (raised < config.target || block.timestamp >= deadline + 7 days), "Sale active");
        uint256 value = contributions[msg.sender];
        contributions[msg.sender] = 0;
        raised -= value;
        msg.sender.safeTransferETH(value);
    }
}

contract PackLauncherFactory is LauncherFactoryBase {
    address public immutable hub;
    address public immutable guardian;
    address public immutable vaultFactory;
    UpgradeableBeacon public immutable beacon;

    constructor(address hub_, address guardian_, address vaultFactory_) {
        hub = hub_;
        guardian = guardian_;
        vaultFactory = vaultFactory_;
        beacon = new UpgradeableBeacon(address(this), address(new PackLauncher()));
    }

    function _getHub() internal view override returns (address) { return hub; }
    function _getGuardian() internal view override returns (address) { return guardian; }

    function _newLauncher(address creator, bytes calldata data) internal override returns (address launcher) {
        PackConfig memory config = abi.decode(data, (PackConfig));
        require(ICollectionRegistry(vaultFactory).shopFor(config.collection) != address(0), "Unsupported collection");
        launcher = LibClone.deployERC1967BeaconProxy(address(beacon));
        PackLauncher(launcher).initialize{value: msg.value}(hub, creator, vaultFactory, config);
    }

    function upgradeVaultImplementation(address implementation) external override onlyGuardian {
        beacon.upgradeTo(implementation);
    }

    function launcherDataSchema() external pure override returns (LauncherDataSchema memory schema) {
        schema.description = "Collect three genesis cards and reach the BNB target to launch.";
        schema.fields = new FieldDescriptor[](7);
        schema.fields[0] = FieldDescriptor("name", "string", "Token name", 0);
        schema.fields[1] = FieldDescriptor("symbol", "string", "Ticker", 0);
        schema.fields[2] = FieldDescriptor("meta", "string", "Metadata CID", 0);
        schema.fields[3] = FieldDescriptor("salt", "bytes32", "Flap token salt for a 7777 address", 0);
        schema.fields[4] = FieldDescriptor("target", "uint256", "BNB target", 18);
        schema.fields[5] = FieldDescriptor("duration", "uint256", "Sale duration in seconds", 0);
        schema.fields[6] = FieldDescriptor("collection", "address", "Supported ERC-721 collection", 0);
    }
}
