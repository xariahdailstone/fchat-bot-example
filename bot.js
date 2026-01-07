// F-Chat Example Bot
// by Xariah Dailstone

const ACCOUNT_NAME = process.env["FCHAT_ACCOUNT_NAME"];
const PASSWORD = process.env["FCHAT_ACCOUNT_PASSWORD"];
const CHARACTER_NAME = process.env["FCHAT_CHARACTER_NAME"];
const CHANNELS_TO_JOIN = [ "Development" ];

const WebSocket = require('ws');


/*
 * ChatWebSocket
 * This class wraps a raw underlying WebSocket object and turns it into
 * an async-compliant reader/writer for chat messages.
 */
class ChatWebSocket {
    static createAsync(url) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            let chatWebSocket;
            ws.onopen = () => {
                chatWebSocket = new ChatWebSocket(ws);
                resolve(chatWebSocket);
            };
            ws.onclose = () => { 
                if (chatWebSocket) {
                    chatWebSocket.#closed();
                }
                else {
                    reject(new Error("Connection closed."));
                }
            };
            ws.onmessage = (messageEvent) => { 
                chatWebSocket.#messageReceived(messageEvent.data);
            };
            ws.onerror = (errorEvent) => { 
                if (chatWebSocket) {
                    chatWebSocket.#errored(errorEvent);
                }
                else {
                    reject(new Error("Connection failed.", { cause: errorEvent }));
                }
            };
        });
    }

    constructor(ws) {
        this.#ws = ws;
    }

    #ws;

    #closed() {
        this.#receivedMessageBuffer.push(null);
        while (this.#currentReadWaiters.length > 0) {
            const satisfyWaiter = this.#currentReadWaiters.shift();
            satisfyWaiter(null);
        }
    }
    #errored() {
        this.#receivedMessageBuffer.push(null);
        while (this.#currentReadWaiters.length > 0) {
            const satisfyWaiter = this.#currentReadWaiters.shift();
            satisfyWaiter(null);
        }
    }
    #messageReceived(data) {
        if (this.#currentReadWaiters.length > 0) {
            const satisfyWaiter = this.#currentReadWaiters.shift();
            satisfyWaiter(data);
        }
        else {
            this.#receivedMessageBuffer.push(data);
        }
    }

    #receivedMessageBuffer = [];
    #currentReadWaiters = [];

    // Close the socket.
    close() {
        try { this.#ws.close(); }
        catch { }
    }

    // Write a chat message to the socket.
    sendMessage(code, data) {
        const strToSend = (data != null)
            ? `${code} ${JSON.stringify(data)}`
            : code;
        
        this.#ws.send(strToSend);
    }

    // Read a chat message from the socket asynchronously.  If the
    // socket has closed, this method will return null and will continue
    // to return null for all subsequent reads.
    // Chat messages are returned as objects in the format:
    //   { code: string, body: object|undefined }
    async readMessageAsync() {
        const res = await this.#readMessageRawAsync();
        if (res == null) {
            return null;
        }
        else {
            const msg = parseIncomingMessage(res);
            return msg;
        }
    }

    async #readMessageRawAsync() {
        if (this.#receivedMessageBuffer.length > 0) {
            const res = this.#receivedMessageBuffer.shift();
            return res;
        }
        else {
            const readPromise = new Promise(resolve => {
                this.#currentReadWaiters.push(resolve);
            });
            const res = await readPromise;
            return res;
        }
    }
}

async function getApiTicketAsync() {
    const getApiTicketForm = new URLSearchParams()
    getApiTicketForm.append("account", ACCOUNT_NAME);
    getApiTicketForm.append("password", PASSWORD);

    console.info(`Getting API ticket for ${ACCOUNT_NAME}...`);
    console.info(getApiTicketForm.toString());
    const getApiTicketResponse = await fetch(
        "https://www.f-list.net/json/getApiTicket.php",
        {
            "method": "POST",
            "headers": {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            "body": getApiTicketForm.toString()
        }
    );
    if (getApiTicketResponse.status != 200) {
        throw new Error(`Unable to call getApiTicket.php; HTTP status code ${getApiTicketResponse.status}`);
    }

    const getApiTicketJsonStr = await getApiTicketResponse.text();
    let getApiTicketJsonObj;
    try {
        getApiTicketJsonObj = JSON.parse(getApiTicketJsonStr);
    }
    catch {
        console.error(`Failed to parse JSON: ${getApiTicketJsonStr}`);
    }

    if (getApiTicketJsonObj == null) {
        throw new Error(`Unable to call getApiTicket.php; returned null response`);
    }
    if (getApiTicketJsonObj.error != null && getApiTicketJsonObj.error != "") {
        throw new Error(`Unable to call getApiTicket.php; login error: ${getApiTicketJsonObj.error}`);
    }

    const loginTicket = getApiTicketJsonObj.ticket;
    console.info(`Got API ticket: ${loginTicket}`);
    return loginTicket;
}

async function connectToChatSocketAsync(loginTicket) {
    console.info("Connecting to F-Chat socket...");
    const result = await ChatWebSocket.createAsync("wss://chat.f-list.net/chat2");
    console.info("Connected to F-Chat socket.");
    return result;
}


/** @param {string} str */
function parseIncomingMessage(str) {
    const spaceIdx = str.indexOf(' ');
    if (spaceIdx == -1) {
        return { code: str };
    }
    else {
        const code = str.substring(0, spaceIdx);
        const bodyStr = str.substring(spaceIdx + 1);
        return { code: code, body: JSON.parse(bodyStr) };
    }
}

function makeOutgoingMessage(code, body) {
    if (body != null) {
        return `${code} ${JSON.stringify(body)}`;
    }
    else {
        return code;
    }
}


async function identifyAsync(chatSocket, loginTicket) {
    console.info(`Identifying ourselves to F-Chat as ${CHARACTER_NAME}...`);

    const idnPayload = {
        "method": "ticket",
        "account": ACCOUNT_NAME,
        "ticket": loginTicket,
        "character": CHARACTER_NAME,
        "cname": "Xariah's Example Bot",
        "cversion": "1.0"
    };
    chatSocket.sendMessage("IDN", idnPayload);

    while (true) {
        const msg = await chatSocket.readMessageAsync();
        if (msg == null) {
            throw new Error("Chat disconnected during identification.");
        }
        else if (msg.code == "ERR") {
            throw new Error(`Identification failed with error ${msg.data.code}: ${msg.data.message}`);
        }
        else if (msg.code == "IDN") {
            console.info("Identified to F-Chat.");
            break;
        }
    }
}

async function handlePing(chatSocket, msg) {
    chatSocket.sendMessage("PIN");
}

async function handleChannelJoined(chatSocket, msg) {
    console.info(`We have joined channel "${msg.body.channel}"`);
}

async function handlePrivateMessage(chatSocket, msg) {
    console.log(JSON.stringify(msg));
    const priPayload = {
        "recipient": msg.body.character,
        "message": msg.body.message
    };
    chatSocket.sendMessage("PRI", priPayload);
}

async function handleChannelMessage(chatSocket) {
    if (msg.message == "!hello") {
        const msgPayload = {
            "channel": msg.body.channel,
            "message": `Hello, ${msg.body.character}!`
        };
        chatSocket.sendMessage("MSG", msgPayload);
    }
}

const messageTypeHandlers = {
    "PIN": handlePing,
    "JCH": handleChannelJoined,
    "PRI": handlePrivateMessage,
    "MSG": handleChannelMessage
}
async function mainLoopAsync(chatSocket) {
    while (true) {
        const msg = await chatSocket.readMessageAsync();
        if (msg == null) {
            console.info("No more incoming messages available.");
            break;
        }
        else {
            const handler = messageTypeHandlers[msg.code];
            if (handler != null) {
                await handler(chatSocket, msg);
            }
            else {
                //console.warn(`Unhandled incoming message: ${msg.code}`);
            }
        }
    }
}

const exitCode = (async () => {
    try {
        const loginTicket = await getApiTicketAsync();
        const chatSocket = await connectToChatSocketAsync();
        try {
            await identifyAsync(chatSocket, loginTicket);
            for (let chToJoin of CHANNELS_TO_JOIN) {
                console.info(`Joining channel ${chToJoin}...`);
                chatSocket.sendMessage("JCH", { "channel": chToJoin });
            }
            await mainLoopAsync(chatSocket);
            console.info("Chat connection closed.");
        }
        finally {
            chatSocket.close();
        }
        return 0;
    }
    catch (e) {
        const errorMessage = (e && e.message) ? e.message : e.toString();
        console.error("===============")
        console.error("UNHANDLED ERROR")
        console.error("- - - - - - - -")
        console.error(errorMessage);
        console.error("===============")
        return 1;
    }
})();
return exitCode;