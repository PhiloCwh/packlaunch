// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPortal} from "./flap/IPortal.sol";
import {LibString} from "solady/utils/LibString.sol";
import {ICards, ShardVault} from "./ShardVault.sol";

struct XGeneralProof {
    uint128 tweetId;
    string xHandle;
    uint128 xId;
    string substring;
}

interface IXGeneralVerifier {
    function verify(XGeneralProof calldata proof, bytes calldata signature) external view returns (bool);
}

contract CardShowcase {
    using LibString for address;
    using LibString for uint256;

    IPortal public immutable portal;
    ICards public immutable cards;
    IXGeneralVerifier public immutable verifier;
    mapping(uint256 => uint128) public showcasedTweet;
    mapping(uint128 => bool) public usedTweet;

    event CardShowcased(address indexed collector, uint256 indexed card, uint128 indexed tweetId, uint128 xId);

    constructor(address portal_, address cards_, address verifier_) {
        require(portal_.code.length > 0 && cards_.code.length > 0 && verifier_.code.length > 0, "Invalid integration");
        portal = IPortal(portal_);
        cards = ICards(cards_);
        verifier = IXGeneralVerifier(verifier_);
    }

    function challenge(address collector, address vault, uint256 card) public view returns (string memory) {
        return string.concat("PackLaunch #", card.toString(), " holder=", collector.toHexString(),
            " vault=", vault.toHexString(), " campaign=", address(this).toHexString(), " chain=", block.chainid.toString());
    }

    function showcase(address vault, uint256 card, XGeneralProof calldata proof, bytes calldata signature) external {
        require(proof.tweetId != 0 && !usedTweet[proof.tweetId] && showcasedTweet[card] == 0, "Already showcased");
        ShardVault source = ShardVault(payable(vault));
        (address registered,) = portal.getLaunchVault(address(source.token()));
        require(registered == vault && address(source.cards()) == address(cards), "Unknown vault");
        require(source.stocked(card) && cards.ownerOf(card) == msg.sender, "Card owner only");
        require(keccak256(bytes(proof.substring)) == keccak256(bytes(challenge(msg.sender, vault, card))), "Challenge mismatch");
        require(verifier.verify(proof, signature), "Invalid X proof");

        usedTweet[proof.tweetId] = true;
        showcasedTweet[card] = proof.tweetId;
        emit CardShowcased(msg.sender, card, proof.tweetId, proof.xId);
    }
}
