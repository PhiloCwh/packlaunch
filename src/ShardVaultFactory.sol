// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DirectLaunchVaultFactoryBase} from "./flap/DirectLaunchVaultFactoryBase.sol";
import {IPortalTypes} from "./flap/IPortal.sol";
import {Distribution} from "./flap/Distribution.sol";
import {VaultDataSchema, FactoryPolicy, FieldDescriptor} from "./flap/IVaultSchemas.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";
import {ShardVault} from "./ShardVault.sol";

contract ShardVaultFactory is DirectLaunchVaultFactoryBase {
    address public immutable hub;
    address public immutable guardian;
    mapping(address => address) public shopFor;
    address public immutable randomSource;
    UpgradeableBeacon public immutable beacon;

    constructor(address hub_, address guardian_, address[] memory collections, address[] memory shops, address random_) {
        require(hub_ != address(0) && guardian_ != address(0), "Invalid authority");
        require(collections.length > 0 && collections.length == shops.length && random_.code.length > 0, "Invalid adapters");
        for (uint256 i; i < collections.length; ++i) {
            address collection = collections[i];
            require(collection.code.length > 0 && shops[i].code.length > 0 && shopFor[collection] == address(0), "Invalid collection");
            (bool ok, bytes memory result) = collection.staticcall(abi.encodeWithSignature("supportsInterface(bytes4)", bytes4(0x80ac58cd)));
            require(ok && result.length == 32 && abi.decode(result, (bool)), "ERC721 required");
            shopFor[collection] = shops[i];
        }
        hub = hub_;
        guardian = guardian_;
        randomSource = random_;
        beacon = new UpgradeableBeacon(address(this), address(new ShardVault()));
    }

    function _getHub() internal view override returns (address) { return hub; }
    function _getGuardian() internal view override returns (address) { return guardian; }

    function isQuoteTokenSupported(address quote) public pure override returns (bool) { return quote == address(0); }

    function newVault(address token, address creator, uint8 kind, bytes calldata params)
        external override onlyHub returns (address vault)
    {
        (IPortalTypes.CreateTaxTokenParams memory p, Distribution memory distribution, bytes memory data) =
            _validateLaunch(token, creator, kind, params);
        _requireNoReserveDistribution(distribution);
        require(p.feeConfigs.length == 1 && p.feeConfigs[0].bps == 10_000, "Requires full tax share");
        require(data.length == 96, "Invalid vault data");
        (address launcher, address operator, address collection) = abi.decode(data, (address, address, address));
        address shop = shopFor[collection];
        require(shop != address(0), "Unsupported collection");
        require(launcher == distribution.strategy && launcher.code.length > 0, "Expected launcher strategy");
        vault = LibClone.deployERC1967BeaconProxy(address(beacon));
        ShardVault(payable(vault)).initialize(token, collection, shop, randomSource, operator, launcher);
    }

    function upgradeVaultImplementation(address implementation) external override onlyGuardian {
        beacon.upgradeTo(implementation);
    }

    function vaultDataSchema() public pure override returns (VaultDataSchema memory schema) {
        schema.description = "Native quote; full tax share stocks Gacha cards for fragment dividends.";
        schema.fields = new FieldDescriptor[](3);
        schema.fields[0] = FieldDescriptor("launcher", "address", "Launch and reserve strategy", 0);
        schema.fields[1] = FieldDescriptor("operator", "address", "Dividend snapshot publisher", 0);
        schema.fields[2] = FieldDescriptor("collection", "address", "Registered ERC-721 collection", 0);
    }

    function tokenCreationPolicies() public pure override returns (FactoryPolicy[] memory policies) {
        policies = new FactoryPolicy[](1);
        policies[0] = FactoryPolicy("quoteToken", "eq", abi.encode(address(0)), "BNB quote required");
    }
}
