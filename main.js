import bodyParser from "body-parser";
import express from "express";
import { WebSocketServer } from 'ws';

const sockets = [];

class Block {
    constructor(index, previousHash, timestamp, data, hash) {
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
    }
}

const getGenesisBlock = () => {
    return new Block(0, "0", 1465154705, "my genesis block!!", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");
};

const blockchain = [getGenesisBlock()];

const getLatestBlock = () => blockchain[blockchain.length - 1];

const calculateHash = (index, previousHash, timestamp, data) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
};

const generateNextBlock = (blockData) => {
    const previousBlock = getLatestBlock();
    const nextIndex = previousBlock.index + 1;
    const nextTimestamp = new Date().getTime() / 1000;
    const nextHash = calculateHash()
};

const calculateHashForBlcok = (block) => {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};

const isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousBlock) {
        console.log('invalid previoushash');
        return false;
    } else if (calculateHashForBlcok(newBlock) !== newBlock.hash) {
        console.log(`${typeof (newBlock.hash)} ${typeof calculateHashForBlcok(newBlock)}`);
        console.log(`invalid hash: ${calculateHashForBlcok(newBlock)} ${newBlock.hash}`);
        return false
    }
    return true;
};

const isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0] !== JSON.stringify(getGenesisBlock()))) {
        return false;
    }
    const tempBlocks = [blockchainToValidate[0]];
    for (let i = 1; i < blockchainToValidate.length; ++i) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

const MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

const responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

const replaceChain = (newBlocks) => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        BroadcastChannel(responseLatestMsg());
    } else {
        console.log('Received blockchain valid');
    }
};

const responseChainMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify(blockchain)
});

const handleBlockchainResponse = (message) => {
    const receivedBlocks = JSON.parse(message.data).sort((block1, block2) => (b1.index - block2.index));
    const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    const latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log(`blockchain possibly behind. We got: ${latestBlockHeld.index} Peer got: ${latestBlockReceived.index}`);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            blockchain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(queryAllMst());
        } else {
            console.log("Received blockchain is longer than current blockchain");
            replaceChain(receivedBlocks);
        }
    } else {
        console.log('received blockchain is not longer than current blockchain. Do nothing.');
    }
}

const initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        const message = JSON.parse(data);
        console.log(`Received message ${JSON.stringify(message)}`);
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg);
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

const initErrorHandler = (ws) => {
    const closeConnection = (ws) => {
        console.log(`connection failed to peer: ${ws.url}`);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws))
    ws.on('error', () => closeConnection(ws));
}

const queryChainLengthMsg = () => ({
    'type': MessageType.QUERY_LATEST
});

const initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
} 

const connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        const ws = new WebSocket(peer);
        ws.on('open', () => {
            initConnection(ws)
        });
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

const addBlock = () => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }
};

const write = (ws, message) => ws.send(JSON.stringify(message));
const broadcast = (message) => sockets.forEach(sockets => write(socket, message));

const initHttpServer = () => {

    const app = express();    
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => {
        res.send(JSON.stringify(blockchain))
    });
    app.post('/mineBlock', (req, res) => {
        const newBlock = generateNextBlock(req.body.data);
        addBlock(newBlock)
        broadcast(responseLatestMsg());
        console.log(`block added: ${JSON.stringify(newBlock)}`);
        res.send();
    });
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => `${s._socket.remoteAddress}:${s._socket.remotePort}`));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    const http_prot = 8080;
    app.listen(http_prot, () => console.log(`Listening http on port: ${http_prot}`));
};

const initP2PServer = () => {
    const p2p_port = 8255
    const server = new WebSocketServer({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log(`listening websocket p2p port on: ${p2p_port}`);
};

(function main() {
    const initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];
    connectToPeers(initialPeers);
    initHttpServer();
    initP2PServer();
})();