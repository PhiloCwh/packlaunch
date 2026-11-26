// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VaultUISchema, VaultMethodSchema, FieldDescriptor} from "./flap/IVaultSchemas.sol";

interface IHoldingToken {
    function balanceOf(address account) external view returns (uint256);
}

interface ICards {
    function ownerOf(uint256 id) external view returns (address);
    function transferFrom(address from, address to, uint256 id) external;
}

interface ICardShop {
    function price() external view returns (uint256);
    function buy(address recipient) external payable returns (uint256 id);
}

interface IRandomSource {
    function request(uint256 requestId) external;
}

contract ShardVault {
    uint256 public constant MINIMUM = 100_000 ether;
    uint256 public constant COST = 100;
    uint256 public constant TIMEOUT = 1 days;

    IHoldingToken public token;
    ICards public cards;
    ICardShop public shop;
    IRandomSource public randomSource;
    address public operator;
    address public launcher;
    address public pool;
    uint256 public round;
    uint256 public outstanding;
    uint256 public pendingCount;
    uint256 public nextRequest;
    uint256[] private inventory;
    mapping(uint256 => bool) public stocked;
    mapping(uint256 => uint256) public snapshotBlock;
    mapping(uint256 => mapping(address => uint256)) public snapshotHolding;
    mapping(uint256 => mapping(address => uint256)) public claimable;
    mapping(address => uint256) public fragments;
    mapping(address => uint256[]) private collections;

    struct Request {
        address player;
        uint256 deadline;
    }

    mapping(uint256 => Request) public requests;
    mapping(address => uint256) public activeRequest;
    mapping(uint256 => bool) public sealedBox;

    event Stocked(uint256 indexed card);
    event RoundPublished(uint256 indexed round, uint256 blockNumber, uint256 allocated);
    event Claimed(uint256 indexed round, address indexed player, uint256 fragments);
    event BoxIssued(uint256 indexed boxId, address indexed player);
    event OpeningRequested(uint256 indexed requestId, address indexed player);
    event CardWon(uint256 indexed requestId, address indexed player, uint256 indexed card);
    event OpeningCancelled(uint256 indexed requestId);

    constructor() { launcher = address(1); }

    function initialize(address token_, address cards_, address shop_, address random_, address operator_, address launcher_) external {
        require(launcher == address(0), "Already initialized");
        require(token_ != address(0) && cards_.code.length > 0 && shop_.code.length > 0, "Invalid assets");
        require(random_.code.length > 0 && operator_ != address(0) && launcher_ != address(0), "Invalid config");
        token = IHoldingToken(token_);
        cards = ICards(cards_);
        shop = ICardShop(shop_);
        randomSource = IRandomSource(random_);
        operator = operator_;
        launcher = launcher_;
    }

    receive() external payable {}

    function setPool(address pool_) external {
        require(msg.sender == launcher && pool == address(0) && pool_ != address(0), "Pool locked");
        pool = pool_;
    }

    function inventoryCount() external view returns (uint256) {
        return inventory.length;
    }

    function wonCards(address player) external view returns (uint256[] memory) {
        return collections[player];
    }

    function stock(uint256 maxPrice) external {
        uint256 price = shop.price();
        require(price > 0 && price <= maxPrice && address(this).balance >= price, "Budget or price");
        uint256 id = shop.buy{value: price}(address(this));
        require(!stocked[id] && cards.ownerOf(id) == address(this), "Card not received");
        stocked[id] = true;
        inventory.push(id);
        emit Stocked(id);
    }

    // The operator supplies the holder list. The contract verifies balances at publication.
    function publishRound(address[] calldata holders) external {
        require(msg.sender == operator && pool != address(0), "Round unauthorized");
        uint256 budget = inventory.length * COST - outstanding;
        require(budget > 0 && holders.length > 0 && holders.length <= 300, "Round size or inventory");
        uint256 roundId = ++round;
        uint256 total;
        address previous;
        for (uint256 i; i < holders.length; ++i) {
            address holder = holders[i];
            require(holder > previous && holder != pool && holder != launcher && holder != address(this), "Invalid holder list");
            uint256 balance = token.balanceOf(holder);
            require(balance > MINIMUM, "Below threshold");
            snapshotHolding[roundId][holder] = balance;
            total += balance;
            previous = holder;
        }

        uint256 allocated;
        for (uint256 i; i < holders.length; ++i) {
            address holder = holders[i];
            uint256 amount = budget * snapshotHolding[roundId][holder] / total;
            claimable[roundId][holder] = amount;
            allocated += amount;
        }
        require(allocated > 0, "Nothing to allocate");
        outstanding += allocated;
        snapshotBlock[roundId] = block.number;
        emit RoundPublished(roundId, block.number, allocated);
    }

    function claim(uint256 roundId) external {
        uint256 amount = claimable[roundId][msg.sender];
        require(amount > 0, "Nothing to claim");
        delete claimable[roundId][msg.sender];
        fragments[msg.sender] += amount;
        emit Claimed(roundId, msg.sender, amount);
    }

    function claimBox() external returns (uint256 id) {
        id = issueBox();
    }

    function openBox(uint256 id) external {
        startOpening(id);
    }

    // Shortcut for integrations that issue and open a box in the same transaction.
    function open() external returns (uint256 id) {
        id = issueBox();
        startOpening(id);
    }

    function issueBox() private returns (uint256 id) {
        require(fragments[msg.sender] >= COST && activeRequest[msg.sender] == 0, "Need 100 available fragments");
        require(inventory.length > pendingCount, "No available cards");
        fragments[msg.sender] -= COST;
        ++pendingCount;
        id = ++nextRequest;
        requests[id] = Request(msg.sender, 0);
        activeRequest[msg.sender] = id;
        sealedBox[id] = true;
        emit BoxIssued(id, msg.sender);
    }

    function startOpening(uint256 id) private {
        require(requests[id].player == msg.sender && sealedBox[id], "No sealed box owned by caller");
        delete sealedBox[id];
        requests[id].deadline = block.timestamp + TIMEOUT;
        emit OpeningRequested(id, msg.sender);
        randomSource.request(id);
    }

    function fulfill(uint256 id, uint256 randomWord) external {
        require(msg.sender == address(randomSource), "Random source only");
        Request memory request = requests[id];
        require(request.player != address(0) && block.timestamp < request.deadline, "Request expired or unknown");
        uint256 index = randomWord % inventory.length;
        uint256 card = inventory[index];
        inventory[index] = inventory[inventory.length - 1];
        inventory.pop();
        outstanding -= COST;
        clear(id, request.player);
        collections[request.player].push(card);
        cards.transferFrom(address(this), request.player, card);
        require(cards.ownerOf(card) == request.player, "Transfer failed");
        emit CardWon(id, request.player, card);
    }

    function cancel(uint256 id) external {
        Request memory request = requests[id];
        require(request.player == msg.sender && (sealedBox[id] || block.timestamp >= request.deadline), "Request still active");
        clear(id, msg.sender);
        fragments[msg.sender] += COST;
        emit OpeningCancelled(id);
    }

    function description() external pure returns (string memory) {
        return "All vault revenue stocks Gacha cards. Qualifying holders above 100,000 tokens earn proportional fragments. 100 fragments open a card. No operator withdrawal.";
    }

    function vaultUISchema() external pure returns (VaultUISchema memory schema) {
        schema.vaultType = "PackLaunch";
        schema.description = "Earn fragments to open a Gacha card.";
        schema.methods = new VaultMethodSchema[](11);
        schema.methods[0] = viewMethod("inventoryCount", "Cards in custody");
        schema.methods[1] = viewMethod("round", "Latest dividend round");
        schema.methods[2] = viewMethod("fragments", "Available fragments");
        schema.methods[2].inputs = field("player", "address");
        schema.methods[3] = viewMethod("claimable", "Fragments available from round");
        schema.methods[3].inputs = new FieldDescriptor[](2);
        schema.methods[3].inputs[0] = FieldDescriptor("roundId", "uint256", "Dividend round", 0);
        schema.methods[3].inputs[1] = FieldDescriptor("player", "address", "Wallet", 0);
        schema.methods[4] = writeMethod("claim", "Claim round fragments");
        schema.methods[4].inputs = field("roundId", "uint256");
        schema.methods[5] = writeMethod("open", "Use 100 fragments to open a box");
        schema.methods[6] = writeMethod("cancel", "Return fragments after request timeout");
        schema.methods[6].inputs = field("requestId", "uint256");
        schema.methods[7] = writeMethod("stock", "Use vault funds to acquire one card");
        schema.methods[7].inputs = field("maxPrice", "uint256");
        schema.methods[7].inputs[0].decimals = 18;
        schema.methods[8] = viewMethod("activeRequest", "Pending opening request");
        schema.methods[8].inputs = field("player", "address");
        schema.methods[9] = writeMethod("claimBox", "Use 100 fragments to receive one sealed box");
        schema.methods[10] = writeMethod("openBox", "Open a sealed box you own");
        schema.methods[10].inputs = field("boxId", "uint256");
    }

    function field(string memory name, string memory kind) private pure returns (FieldDescriptor[] memory fields) {
        fields = new FieldDescriptor[](1);
        fields[0] = FieldDescriptor(name, kind, "", 0);
    }

    function viewMethod(string memory name, string memory label) private pure returns (VaultMethodSchema memory method) {
        method.name = name;
        method.description = label;
        method.outputs = field("value", "uint256");
    }

    function writeMethod(string memory name, string memory label) private pure returns (VaultMethodSchema memory method) {
        method.name = name;
        method.description = label;
        method.isWriteMethod = true;
    }

    function clear(uint256 id, address player) private {
        delete sealedBox[id];
        delete requests[id];
        delete activeRequest[player];
        --pendingCount;
    }
}
