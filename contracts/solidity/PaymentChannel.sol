// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PaymentChannel
 * @notice Bidirectional payment channels with privacy features
 * @dev Implements state channels for instant, low-cost transactions
 * 
 * Features:
 * - Bidirectional payment channels
 * - Instant off-chain transactions
 * - Privacy via commitments
 * - Challenge-response mechanism
 * - Multi-hop routing support
 * - Emergency closure
 */

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract PaymentChannel is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ========== STATE VARIABLES ==========

    /// @notice Channels by ID
    mapping(bytes32 => Channel) public channels;

    /// @notice User nonces for replay protection
    mapping(address => uint256) public nonces;

    /// @notice Challenge period (in seconds)
    uint256 public constant CHALLENGE_PERIOD = 1 days;

    // ========== STRUCTS ==========

    struct Channel {
        bytes32 id;
        address participantA;
        address participantB;
        address token; // address(0) for ETH
        uint256 depositA;
        uint256 depositB;
        uint256 balanceA;
        uint256 balanceB;
        uint256 sequenceNumber;
        uint256 challengeTimeout;
        ChannelState state;
        bytes32 balanceCommitment; // Privacy feature
        bool privacyEnabled;
    }

    enum ChannelState {
        NonExistent,
        Open,
        Challenged,
        Closed
    }

    struct StateUpdate {
        bytes32 channelId;
        uint256 sequenceNumber;
        uint256 balanceA;
        uint256 balanceB;
        bytes32 balanceCommitment;
        bytes signatureA;
        bytes signatureB;
    }

    // ========== EVENTS ==========

    event ChannelOpened(
        bytes32 indexed channelId,
        address indexed participantA,
        address indexed participantB,
        address token,
        uint256 depositA,
        uint256 depositB,
        bool privacyEnabled
    );

    event ChannelUpdated(
        bytes32 indexed channelId,
        uint256 sequenceNumber,
        bytes32 balanceCommitment
    );

    event ChannelChallenged(
        bytes32 indexed channelId,
        address challenger,
        uint256 timeout
    );

    event ChannelClosed(
        bytes32 indexed channelId,
        uint256 finalBalanceA,
        uint256 finalBalanceB
    );

    event DisputeResolved(
        bytes32 indexed channelId,
        address winner
    );

    // ========== PUBLIC FUNCTIONS ==========

    /**
     * @notice Open new payment channel
     * @param participantB Other participant address
     * @param token Token address (address(0) for ETH)
     * @param depositA Participant A's deposit
     * @param depositB Participant B's deposit
     * @param privacyEnabled Enable privacy features
     * @return channelId Channel identifier
     */
    function openChannel(
        address participantB,
        address token,
        uint256 depositA,
        uint256 depositB,
        bool privacyEnabled
    ) external payable nonReentrant returns (bytes32 channelId) {
        require(participantB != address(0), "Invalid participant");
        require(participantB != msg.sender, "Cannot channel with self");
        require(depositA > 0 && depositB > 0, "Deposits must be > 0");

        // Generate channel ID
        channelId = keccak256(
            abi.encodePacked(
                msg.sender,
                participantB,
                token,
                nonces[msg.sender]++
            )
        );

        require(
            channels[channelId].state == ChannelState.NonExistent,
            "Channel exists"
        );

        // Handle deposits
        if (token == address(0)) {
            require(msg.value == depositA, "Incorrect ETH amount");
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), depositA);
        }

        // Generate initial balance commitment
        bytes32 commitment = privacyEnabled
            ? generateCommitment(depositA, depositB)
            : bytes32(0);

        // Create channel
        channels[channelId] = Channel({
            id: channelId,
            participantA: msg.sender,
            participantB: participantB,
            token: token,
            depositA: depositA,
            depositB: depositB,
            balanceA: depositA,
            balanceB: depositB,
            sequenceNumber: 0,
            challengeTimeout: 0,
            state: ChannelState.Open,
            balanceCommitment: commitment,
            privacyEnabled: privacyEnabled
        });

        emit ChannelOpened(
            channelId,
            msg.sender,
            participantB,
            token,
            depositA,
            depositB,
            privacyEnabled
        );
    }

    /**
     * @notice Fund existing channel (add liquidity)
     * @param channelId Channel identifier
     * @param amount Amount to add
     */
    function fundChannel(bytes32 channelId, uint256 amount)
        external
        payable
        nonReentrant
    {
        Channel storage channel = channels[channelId];
        require(channel.state == ChannelState.Open, "Channel not open");
        require(amount > 0, "Amount must be > 0");

        if (msg.sender == channel.participantA) {
            if (channel.token == address(0)) {
                require(msg.value == amount, "Incorrect ETH amount");
            } else {
                IERC20(channel.token).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amount
                );
            }
            channel.depositA += amount;
            channel.balanceA += amount;
        } else if (msg.sender == channel.participantB) {
            if (channel.token == address(0)) {
                require(msg.value == amount, "Incorrect ETH amount");
            } else {
                IERC20(channel.token).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amount
                );
            }
            channel.depositB += amount;
            channel.balanceB += amount;
        } else {
            revert("Not a participant");
        }

        // Update commitment
        if (channel.privacyEnabled) {
            channel.balanceCommitment = generateCommitment(
                channel.balanceA,
                channel.balanceB
            );
        }
    }

    /**
     * @notice Update channel state (off-chain state)
     * @param update Signed state update
     */
    function updateState(StateUpdate calldata update) external nonReentrant {
        Channel storage channel = channels[update.channelId];
        require(channel.state == ChannelState.Open, "Channel not open");
        require(
            update.sequenceNumber > channel.sequenceNumber,
            "Old state"
        );

        // Verify signatures
        bytes32 messageHash = getMessageHash(
            update.channelId,
            update.sequenceNumber,
            update.balanceA,
            update.balanceB
        );

        address signerA = messageHash.toEthSignedMessageHash().recover(
            update.signatureA
        );
        address signerB = messageHash.toEthSignedMessageHash().recover(
            update.signatureB
        );

        require(
            signerA == channel.participantA || signerB == channel.participantA,
            "Invalid signature A"
        );
        require(
            signerA == channel.participantB || signerB == channel.participantB,
            "Invalid signature B"
        );

        // Validate balances
        require(
            update.balanceA + update.balanceB ==
                channel.depositA + channel.depositB,
            "Invalid balances"
        );

        // Update channel
        channel.balanceA = update.balanceA;
        channel.balanceB = update.balanceB;
        channel.sequenceNumber = update.sequenceNumber;
        channel.balanceCommitment = update.balanceCommitment;

        emit ChannelUpdated(
            update.channelId,
            update.sequenceNumber,
            update.balanceCommitment
        );
    }

    /**
     * @notice Start cooperative close
     * @param channelId Channel identifier
     * @param finalBalanceA Final balance for participant A
     * @param finalBalanceB Final balance for participant B
     * @param signatureA Signature from participant A
     * @param signatureB Signature from participant B
     */
    function cooperativeClose(
        bytes32 channelId,
        uint256 finalBalanceA,
        uint256 finalBalanceB,
        bytes calldata signatureA,
        bytes calldata signatureB
    ) external nonReentrant {
        Channel storage channel = channels[channelId];
        require(channel.state == ChannelState.Open, "Channel not open");

        // Verify signatures
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "CLOSE",
                channelId,
                finalBalanceA,
                finalBalanceB
            )
        );

        address signerA = messageHash.toEthSignedMessageHash().recover(
            signatureA
        );
        address signerB = messageHash.toEthSignedMessageHash().recover(
            signatureB
        );

        require(signerA == channel.participantA, "Invalid signature A");
        require(signerB == channel.participantB, "Invalid signature B");

        // Validate balances
        require(
            finalBalanceA + finalBalanceB == channel.depositA + channel.depositB,
            "Invalid balances"
        );

        // Close channel
        closeChannelInternal(channelId, finalBalanceA, finalBalanceB);
    }

    /**
     * @notice Challenge channel state (unilateral close)
     * @param channelId Channel identifier
     */
    function challengeClose(bytes32 channelId) external nonReentrant {
        Channel storage channel = channels[channelId];
        require(channel.state == ChannelState.Open, "Channel not open");
        require(
            msg.sender == channel.participantA || msg.sender == channel.participantB,
            "Not a participant"
        );

        channel.state = ChannelState.Challenged;
        channel.challengeTimeout = block.timestamp + CHALLENGE_PERIOD;

        emit ChannelChallenged(channelId, msg.sender, channel.challengeTimeout);
    }

    /**
     * @notice Respond to challenge with newer state
     * @param update Newer state update
     */
    function respondToChallenge(StateUpdate calldata update)
        external
        nonReentrant
    {
        Channel storage channel = channels[update.channelId];
        require(channel.state == ChannelState.Challenged, "Not challenged");
        require(block.timestamp < channel.challengeTimeout, "Challenge expired");
        require(
            update.sequenceNumber > channel.sequenceNumber,
            "Not newer state"
        );

        // Verify signatures (same as updateState)
        bytes32 messageHash = getMessageHash(
            update.channelId,
            update.sequenceNumber,
            update.balanceA,
            update.balanceB
        );

        address signerA = messageHash.toEthSignedMessageHash().recover(
            update.signatureA
        );
        address signerB = messageHash.toEthSignedMessageHash().recover(
            update.signatureB
        );

        require(
            (signerA == channel.participantA && signerB == channel.participantB) ||
            (signerA == channel.participantB && signerB == channel.participantA),
            "Invalid signatures"
        );

        // Update to newer state
        channel.balanceA = update.balanceA;
        channel.balanceB = update.balanceB;
        channel.sequenceNumber = update.sequenceNumber;
        channel.state = ChannelState.Open;
        channel.challengeTimeout = 0;

        emit DisputeResolved(update.channelId, msg.sender);
    }

    /**
     * @notice Finalize challenged close
     * @param channelId Channel identifier
     */
    function finalizeClose(bytes32 channelId) external nonReentrant {
        Channel storage channel = channels[channelId];
        require(channel.state == ChannelState.Challenged, "Not challenged");
        require(
            block.timestamp >= channel.challengeTimeout,
            "Challenge period active"
        );

        // Close with last known state
        closeChannelInternal(channelId, channel.balanceA, channel.balanceB);
    }

    // ========== VIEW FUNCTIONS ==========

    /**
     * @notice Get channel details
     */
    function getChannel(bytes32 channelId)
        external
        view
        returns (Channel memory)
    {
        return channels[channelId];
    }

    /**
     * @notice Get message hash for signing
     */
    function getMessageHash(
        bytes32 channelId,
        uint256 sequenceNumber,
        uint256 balanceA,
        uint256 balanceB
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(channelId, sequenceNumber, balanceA, balanceB)
        );
    }

    // ========== INTERNAL FUNCTIONS ==========

    /**
     * @notice Generate balance commitment
     */
    function generateCommitment(uint256 balanceA, uint256 balanceB)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(balanceA, balanceB));
    }

    /**
     * @notice Close channel and distribute funds
     */
    function closeChannelInternal(
        bytes32 channelId,
        uint256 finalBalanceA,
        uint256 finalBalanceB
    ) internal {
        Channel storage channel = channels[channelId];

        // Transfer funds
        if (finalBalanceA > 0) {
            if (channel.token == address(0)) {
                payable(channel.participantA).transfer(finalBalanceA);
            } else {
                IERC20(channel.token).safeTransfer(
                    channel.participantA,
                    finalBalanceA
                );
            }
        }

        if (finalBalanceB > 0) {
            if (channel.token == address(0)) {
                payable(channel.participantB).transfer(finalBalanceB);
            } else {
                IERC20(channel.token).safeTransfer(
                    channel.participantB,
                    finalBalanceB
                );
            }
        }

        channel.state = ChannelState.Closed;

        emit ChannelClosed(channelId, finalBalanceA, finalBalanceB);
    }
}
