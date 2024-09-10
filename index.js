const Web3 = require('web3');
const winston = require('winston');
const axios = require('axios');
require('dotenv').config();

// Configure Winston Logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console(),  // Optional: log to console
    ],
});

// Connect to Ethereum node via Alchemy WebSocket provider
const webSocketProvider = new Web3.providers.WebsocketProvider(process.env.ETH_NODE_URL);
const web3 = new Web3(webSocketProvider);

const contractAddress = '0x00000000219ab540356cBB839Cbe05303d7705Fa';

// Telegram bot setup
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

// Function to send Telegram notifications
const sendTelegramNotification = async (message) => {
    try {
        await axios.post(telegramUrl, {
            chat_id: chatId,
            text: message,
        });
    } catch (err) {
        logger.error('Error sending Telegram notification:', err.message);
    }
};

async function trackDeposits() {
    try {
        logger.info('Starting deposit tracker...');

        // Subscribe to new blocks
        web3.eth.subscribe('newBlockHeaders', async (error, block) => {
            if (error) {
                logger.error(`Subscription error: ${error.message}`);
                return;
            }

            try {
                // Get the block details including transactions
                const blockDetails = await web3.eth.getBlock(block.number, true);

                // Process each transaction in the block
                blockDetails.transactions.forEach(async (tx) => {
                    if (tx.to && tx.to.toLowerCase() === contractAddress.toLowerCase()) {
                        try {
                            // Fetch transaction receipt
                            const receipt = await web3.eth.getTransactionReceipt(tx.hash);

                            logger.info('New Deposit Detected:', { txHash: tx.hash });

                            // Extract required data from the transaction
                            const depositData = {
                                blockNumber: receipt.blockNumber,
                                blockTimestamp: (await web3.eth.getBlock(receipt.blockNumber)).timestamp,
                                fee: tx.gasPrice,
                                hash: tx.hash,
                                pubkey: receipt.logs[0]?.topics[1],  // Example topic, may change
                            };

                            logger.info('Deposit Data:', depositData);
                            // Save depositData to your database or log it
                            
                            // Send Telegram notification
                            await sendTelegramNotification(`New ETH deposit detected: ${tx.hash}`);
                            
                        } catch (err) {
                            logger.error(`Error processing transaction ${tx.hash}: ${err.message}`);
                        }
                    }
                });
            } catch (err) {
                logger.error(`Error fetching block details for block number ${block.number}: ${err.message}`);
            }
        });

        // Handle WebSocket errors and reconnections
        webSocketProvider.on('error', (error) => {
            logger.error('WebSocket error:', error);
        });

        webSocketProvider.on('end', () => {
            logger.info('WebSocket connection closed. Attempting to reconnect...');
            // Implement reconnection logic if needed
        });
    } catch (err) {
        logger.error(`Error initializing deposit tracker: ${err.message}`);
    }
}

trackDeposits();
