// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solady/tokens/ERC20.sol";
import {ERC721} from "solady/tokens/ERC721.sol";
import {IPortalTypes} from "../flap/IPortal.sol";
import {Distribution} from "../flap/Distribution.sol";
import {IStrategy} from "../flap/IStrategy.sol";
import {ILauncherFactory, ILauncherDescription} from "../flap/ILauncher.sol";
import {IDirectLaunchVaultFactory} from "../flap/ILaunchVaultSpec.sol";
import {XGeneralProof} from "../CardShowcase.sol";
import {ShardVault} from "../ShardVault.sol";

contract DemoToken is ERC20 {
    constructor(uint256 supply) { _mint(msg.sender, supply); }
    function name() public pure override returns (string memory) { return "PackLaunch"; }
    function symbol() public pure override returns (string memory) { return "PACK"; }
}

contract DemoCards is ERC721 {
    uint256 public constant price = 0.01 ether;
    uint256 public nextCard;
    string private collectionName;
    string private collectionSymbol;

    constructor(string memory name_, string memory symbol_) {
        collectionName = name_;
        collectionSymbol = symbol_;
    }

    function buy(address recipient) external payable returns (uint256 id) {
        require(msg.value == price, "Wrong price");
        id = ++nextCard;
        _mint(recipient, id);
    }

    function name() public view override returns (string memory) { return collectionName; }
    function symbol() public view override returns (string memory) { return collectionSymbol; }
    function tokenURI(uint256) public pure override returns (string memory) { return ""; }
}

// Demo-only randomness. The operator can choose the word, so this adapter is unsuitable for real prizes.
contract DemoRandom {
    address public immutable operator = msg.sender;
    mapping(address => mapping(uint256 => bool)) public pending;

    function request(uint256 id) external { pending[msg.sender][id] = true; }

    function reveal(address vault, uint256 id, uint256 word) external {
        require(msg.sender == operator && pending[vault][id], "Demo operator only");
        delete pending[vault][id];
        ShardVault(payable(vault)).fulfill(id, word);
    }
}

contract DemoPool {
    DemoToken public immutable token;
    address payable public immutable vault;
    constructor(DemoToken token_, address payable vault_) payable { token = token_; vault = vault_; }

    function buy() external payable {
        require(msg.value > 0, "Empty trade");
        uint256 tax = msg.value * 300 / 10_000;
        (bool sent,) = vault.call{value: tax}("");
        require(sent && token.transfer(msg.sender, (msg.value - tax) * 1000), "Demo trade failed");
    }
}

contract DemoPortal {
    uint256 public constant SALT_LOCK_FEE = 0.001 ether;
    address public immutable admin = msg.sender;
    mapping(address => bool) public enabled;
    mapping(address => address) public launcherFactory;
    mapping(bytes32 => address) public locker;
    mapping(address => bool) public launched;
    mapping(address => address) private vaultByToken;
    mapping(address => address) private vaultFactoryByToken;

    event FlapNewLauncherCreated(address launcher, address launcherFactory, address creator, string description);

    function setLauncherFactory(address factory, bool allowed) external {
        require(msg.sender == admin, "Admin only");
        enabled[factory] = allowed;
    }

    function launcherFactoryMultiplier(address factory) external view returns (bool, uint16) {
        return (enabled[factory], 10_000);
    }

    function newLauncher(address factory, bytes calldata data) external payable returns (address launcher) {
        require(enabled[factory], "Factory not enabled");
        launcher = ILauncherFactory(factory).newLauncher{value: msg.value}(msg.sender, data);
        launcherFactory[launcher] = factory;
        emit FlapNewLauncherCreated(launcher, factory, msg.sender, ILauncherDescription(launcher).description());
    }

    function lockSalt(bytes32 salt, uint8) external payable {
        require(msg.value == SALT_LOCK_FEE && locker[salt] == address(0), "Salt unavailable");
        locker[salt] = msg.sender;
    }

    function launchTaxTokenV2(
        IPortalTypes.CreateTaxTokenParams calldata p,
        Distribution calldata distribution,
        IPortalTypes.CreatorBuyParams calldata
    ) external payable returns (address token, address pair) {
        require(enabled[launcherFactory[msg.sender]] && !launched[msg.sender], "Launcher unavailable");
        require(locker[p.salt] == msg.sender && msg.value == p.poolQuote, "Invalid launch");
        launched[msg.sender] = true;

        DemoToken issued = new DemoToken(p.totalSupply);
        token = address(issued);
        IPortalTypes.FeeConfigVault memory config = abi.decode(p.feeConfigs[0].configData, (IPortalTypes.FeeConfigVault));
        address factory = config.vaultFactory;
        address vault = IDirectLaunchVaultFactory(factory).newVault(token, msg.sender, 0, abi.encode(p, distribution));
        vaultByToken[token] = vault;
        vaultFactoryByToken[token] = factory;
        pair = address(new DemoPool{value: msg.value}(issued, payable(vault)));
        issued.transfer(pair, p.poolToken);
        issued.approve(distribution.strategy, distribution.amount);
        IStrategy(distribution.strategy).initializeDistribution(token, distribution.amount, distribution.configData, p.salt);
        require(issued.allowance(address(this), distribution.strategy) == 0, "Reserve not distributed");
    }

    function getLaunchVault(address token) external view returns (address, address) {
        return (vaultByToken[token], vaultFactoryByToken[token]);
    }
}

contract DemoXVerifier {
    address public immutable operator = msg.sender;
    mapping(bytes32 => bool) private approved;

    function approveProof(XGeneralProof calldata proof) external {
        require(msg.sender == operator, "Demo operator only");
        approved[keccak256(abi.encode(proof))] = true;
    }

    function verify(XGeneralProof calldata proof, bytes calldata) external view returns (bool) {
        return approved[keccak256(abi.encode(proof))];
    }
}
