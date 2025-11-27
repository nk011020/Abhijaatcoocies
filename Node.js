// auto-messenger-websocket-server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const wiegine = require('fca-mafiya');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ==================== WEBSOCKET CONNECTION MANAGER ====================
class WebSocketManager {
    constructor() {
        this.connections = new Set();
        this.heartbeatInterval = null;
    }

    broadcast(data) {
        const message = JSON.stringify(data);
        this.connections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.broadcast({
                type: 'heartbeat',
                timestamp: Date.now(),
                message: '🫀 WebSocket Connection Active'
            });
        }, 30000); // Every 30 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
    }
}

const wsManager = new WebSocketManager();

// ==================== FILE MANAGEMENT ====================
function initializeFiles() {
    const files = {
        'cookies.txt': 'your_facebook_cookie_here\nanother_cookie_here',
        'convo.txt': '123456789',
        'kidsname.txt': 'Priya',
        'yourname.txt': 'R4J',
        'message.txt': 'Hello! 👋\nHow are you?\nGood morning!\nHave a great day!',
        'time.txt': '5'
    };

    Object.keys(files).forEach(filename => {
        if (!fs.existsSync(filename)) {
            fs.writeFileSync(filename, files[filename]);
            console.log(`✅ Created ${filename}`);
        }
    });
}

function readFileContent(filename) {
    try {
        return fs.readFileSync(filename, 'utf8').trim();
    } catch (error) {
        console.log(`❌ Error reading ${filename}:`, error.message);
        return '';
    }
}

function readMessages(filename) {
    try {
        const content = fs.readFileSync(filename, 'utf8');
        return content.split('\n')
            .map(line => line.replace(/\r/g, '').trim())
            .filter(line => line.length > 0);
    } catch (error) {
        console.log(`❌ Error reading ${filename}:`, error.message);
        return [];
    }
}

// ==================== ADVANCED COOKIE MANAGER WITH WEBSOCKET ====================
class AdvancedCookieManager {
    constructor() {
        this.cookies = [];
        this.apiInstances = new Map(); // cookie -> api instance
        this.cookieStatus = new Map(); // cookie -> status
        this.currentCookieIndex = 0;
        this.loadCookies();
    }

    loadCookies() {
        const cookieContent = readFileContent('cookies.txt');
        this.cookies = cookieContent.split('\n')
            .map(cookie => cookie.trim())
            .filter(cookie => cookie.length > 0);
        
        console.log(`🍪 Loaded ${this.cookies.length} cookies`);
        this.initializeAllCookies();
    }

    async initializeAllCookies() {
        console.log('🔗 Initializing all cookies with WebSocket persistence...');
        
        for (const cookie of this.cookies) {
            await this.initializeCookie(cookie);
        }
        
        wsManager.broadcast({
            type: 'cookie_status',
            data: this.getCookieStatusReport()
        });
    }

    async initializeCookie(cookie) {
        return new Promise((resolve) => {
            if (this.apiInstances.has(cookie)) {
                console.log(`✅ Cookie already initialized`);
                resolve(true);
                return;
            }

            console.log(`🔐 Initializing cookie...`);
            
            wiegine.login({ appState: JSON.parse(cookie) }, {}, (err, api) => {
                if (err || !api) {
                    console.log(`❌ Cookie initialization failed: ${err?.message || err}`);
                    this.cookieStatus.set(cookie, { status: 'invalid', lastChecked: Date.now() });
                    resolve(false);
                } else {
                    console.log(`✅ Cookie initialized successfully with WebSocket`);
                    this.apiInstances.set(cookie, api);
                    this.cookieStatus.set(cookie, { 
                        status: 'active', 
                        lastChecked: Date.now(),
                        userInfo: api.getCurrentUserID ? api.getCurrentUserID() : 'unknown'
                    });
                    
                    // Setup keep-alive for this API instance
                    this.setupKeepAlive(api, cookie);
                    resolve(true);
                }
            });
        });
    }

    setupKeepAlive(api, cookie) {
        // Send periodic keep-alive messages to maintain connection
        const keepAliveInterval = setInterval(async () => {
            try {
                // Simple API call to keep connection alive
                if (api && typeof api.getUserInfo === 'function') {
                    api.getUserInfo(api.getCurrentUserID(), (err, data) => {
                        if (err) {
                            console.log(`🔄 Keep-alive failed for cookie, reinitializing...`);
                            this.cookieStatus.set(cookie, { 
                                status: 'reconnecting', 
                                lastChecked: Date.now() 
                            });
                            this.reinitializeCookie(cookie);
                        } else {
                            this.cookieStatus.set(cookie, { 
                                status: 'active', 
                                lastChecked: Date.now(),
                                userInfo: api.getCurrentUserID()
                            });
                        }
                    });
                }
            } catch (error) {
                console.log(`⚠️ Keep-alive error: ${error.message}`);
            }
        }, 600000); // Every 10 minutes

        // Store interval for cleanup
        api.keepAliveInterval = keepAliveInterval;
    }

    async reinitializeCookie(cookie) {
        console.log(`🔄 Reinitializing cookie...`);
        
        // Clear old interval
        const oldApi = this.apiInstances.get(cookie);
        if (oldApi && oldApi.keepAliveInterval) {
            clearInterval(oldApi.keepAliveInterval);
        }
        
        this.apiInstances.delete(cookie);
        await this.delay(2000);
        return this.initializeCookie(cookie);
    }

    getNextAPI() {
        if (this.cookies.length === 0) return null;
        
        let attempts = 0;
        while (attempts < this.cookies.length) {
            const cookie = this.cookies[this.currentCookieIndex];
            this.currentCookieIndex = (this.currentCookieIndex + 1) % this.cookies.length;
            
            const api = this.apiInstances.get(cookie);
            const status = this.cookieStatus.get(cookie);
            
            if (api && status && status.status === 'active') {
                return { api, cookie };
            }
            
            attempts++;
        }
        
        return null;
    }

    getCookieStatusReport() {
        const report = [];
        this.cookies.forEach((cookie, index) => {
            const status = this.cookieStatus.get(cookie) || { status: 'unknown' };
            report.push({
                index,
                status: status.status,
                lastChecked: status.lastChecked,
                userInfo: status.userInfo
            });
        });
        return report;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ==================== ENHANCED MESSAGE ENGINE WITH WEBSOCKET ====================
class EnhancedMessageEngine {
    constructor() {
        this.cookieManager = new AdvancedCookieManager();
        this.isRunning = false;
        this.currentMessageIndex = 0;
        this.loopCount = 0;
        this.totalSent = 0;
        this.totalFailed = 0;
    }

    formatMessage(message) {
        const kidsname = readFileContent('kidsname.txt');
        const yourname = readFileContent('yourname.txt');
        return `${kidsname} ${message} ${yourname}`;
    }

    async sendMessageWithWebSocket(api, message, threadID, cookieIndex) {
        return new Promise((resolve) => {
            const formattedMessage = this.formatMessage(message);
            const startTime = Date.now();

            // WebSocket broadcast - sending start
            wsManager.broadcast({
                type: 'message_start',
                data: {
                    message: formattedMessage,
                    cookieIndex,
                    timestamp: startTime
                }
            });

            api.sendMessage(formattedMessage, threadID, (err, messageInfo) => {
                const endTime = Date.now();
                const duration = endTime - startTime;

                if (err) {
                    console.log(`❌ Failed to send: ${err.message || err}`);
                    this.totalFailed++;
                    
                    wsManager.broadcast({
                        type: 'message_failed',
                        data: {
                            message: formattedMessage,
                            cookieIndex,
                            error: err.message || err,
                            timestamp: endTime,
                            duration
                        }
                    });
                    
                    resolve(false);
                } else {
                    console.log(`✅ Sent successfully!`);
                    this.totalSent++;
                    
                    wsManager.broadcast({
                        type: 'message_sent',
                        data: {
                            message: formattedMessage,
                            cookieIndex,
                            messageId: messageInfo?.messageID || 'unknown',
                            timestamp: endTime,
                            duration
                        }
                    });
                    
                    resolve(true);
                }
            });
        });
    }

    async startMessaging() {
        if (this.isRunning) {
            console.log('⚠️ Messenger is already running');
            return;
        }

        this.isRunning = true;
        console.log('🚀 Starting Enhanced Auto-Messenger Engine with WebSocket...');

        // Broadcast start event
        wsManager.broadcast({
            type: 'engine_start',
            data: {
                timestamp: Date.now(),
                message: 'Messaging engine started'
            }
        });

        // Infinite loop with WebSocket persistence
        while (this.isRunning) {
            try {
                await this.runMessagingCycle();
                
                if (this.isRunning) {
                    console.log(`🔄 Completed cycle ${this.loopCount + 1}. Restarting...`);
                    this.loopCount++;
                    this.currentMessageIndex = 0;
                    
                    // Broadcast cycle completion
                    wsManager.broadcast({
                        type: 'cycle_complete',
                        data: {
                            loopCount: this.loopCount,
                            totalSent: this.totalSent,
                            totalFailed: this.totalFailed,
                            timestamp: Date.now()
                        }
                    });
                    
                    // Small delay before restarting cycle
                    await this.delay(5000);
                }
            } catch (error) {
                console.log(`❌ Cycle error: ${error.message}`);
                wsManager.broadcast({
                    type: 'error',
                    data: {
                        error: error.message,
                        timestamp: Date.now()
                    }
                });
                await this.delay(10000); // Wait 10 seconds before retry
            }
        }
    }

    async runMessagingCycle() {
        const threadID = readFileContent('convo.txt');
        const messages = readMessages('message.txt');
        const delayTime = parseInt(readFileContent('time.txt')) || 5;

        if (!threadID || messages.length === 0) {
            console.log('❌ Missing threadID or messages');
            return;
        }

        console.log(`📊 Starting messaging cycle ${this.loopCount + 1}`);
        console.log(`🎯 Target: ${threadID}`);
        console.log(`💬 Messages: ${messages.length}`);
        console.log(`⏱️ Delay: ${delayTime} seconds`);

        // Broadcast cycle start
        wsManager.broadcast({
            type: 'cycle_start',
            data: {
                loopCount: this.loopCount,
                messageCount: messages.length,
                delayTime,
                timestamp: Date.now()
            }
        });

        for (let i = 0; i < messages.length && this.isRunning; i++) {
            const message = messages[this.currentMessageIndex];
            const apiData = this.cookieManager.getNextAPI();
            
            if (!apiData) {
                console.log('❌ No valid API instances available');
                wsManager.broadcast({
                    type: 'warning',
                    data: {
                        message: 'No valid API instances available',
                        timestamp: Date.now()
                    }
                });
                break;
            }

            const { api, cookie } = apiData;
            const cookieIndex = this.cookieManager.cookies.indexOf(cookie);

            console.log(`\n🔑 Using cookie ${cookieIndex + 1}/${this.cookieManager.cookies.length}`);
            console.log(`📤 [${this.currentMessageIndex + 1}/${messages.length}] Preparing: ${message}`);

            const success = await this.sendMessageWithWebSocket(api, message, threadID, cookieIndex);
            
            if (!success) {
                console.log(`🔄 Message failed, marking cookie for reinitialization...`);
                this.cookieManager.cookieStatus.set(cookie, { 
                    status: 'needs_reinit', 
                    lastChecked: Date.now() 
                });
            }

            this.currentMessageIndex++;
            
            if (this.isRunning && this.currentMessageIndex < messages.length) {
                console.log(`⏳ Waiting ${delayTime} seconds...`);
                
                // Broadcast delay start
                wsManager.broadcast({
                    type: 'delay_start',
                    data: {
                        delayTime,
                        nextMessageIndex: this.currentMessageIndex,
                        timestamp: Date.now()
                    }
                });
                
                await this.delay(delayTime * 1000);
            }
        }
    }

    stopMessaging() {
        this.isRunning = false;
        console.log('🛑 Stopping Enhanced Auto-Messenger Engine...');
        
        wsManager.broadcast({
            type: 'engine_stop',
            data: {
                timestamp: Date.now(),
                message: 'Messaging engine stopped',
                stats: {
                    totalSent: this.totalSent,
                    totalFailed: this.totalFailed,
                    totalLoops: this.loopCount
                }
            }
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStatus() {
        return {
            running: this.isRunning,
            loopCount: this.loopCount,
            currentMessage: this.currentMessageIndex,
            totalCookies: this.cookieManager.cookies.length,
            activeCookies: Array.from(this.cookieManager.cookieStatus.values()).filter(s => s.status === 'active').length,
            totalSent: this.totalSent,
            totalFailed: this.totalFailed,
            cookieStatus: this.cookieManager.getCookieStatusReport()
        };
    }
}

// ==================== WEBSOCKET SERVER SETUP ====================
wss.on('connection', (ws) => {
    console.log('🔗 New WebSocket connection established');
    wsManager.connections.add(ws);

    // Send initial status
    ws.send(JSON.stringify({
        type: 'welcome',
        data: {
            message: 'Connected to R4J M1SHR4 Auto-Messenger Server',
            timestamp: Date.now(),
            version: '2.0'
        }
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 WebSocket message received:', data);
            
            // Handle different message types
            switch (data.type) {
                case 'get_status':
                    ws.send(JSON.stringify({
                        type: 'status',
                        data: messageEngine.getStatus()
                    }));
                    break;
                case 'ping':
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now()
                    }));
                    break;
            }
        } catch (error) {
            console.log('❌ WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        console.log('🔌 WebSocket connection closed');
        wsManager.connections.delete(ws);
    });

    ws.on('error', (error) => {
        console.log('❌ WebSocket error:', error);
        wsManager.connections.delete(ws);
    });
});

// ==================== HTTP SERVER ROUTES ====================
const messageEngine = new EnhancedMessageEngine();

app.get('/', (req, res) => {
    res.status(200).json({
        message: 'R4J M1SHR4 COOKIES WEB SERVER IS RUNNING ; ENJOY GUYS',
        status: 'active',
        websocket: 'connected',
        endpoints: {
            '/': 'Server status',
            '/start': 'Start messaging',
            '/stop': 'Stop messaging', 
            '/status': 'Get current status',
            '/reload': 'Reload configuration files',
            '/cookies': 'Get cookie status',
            '/ws': 'WebSocket endpoint'
        }
    });
});

app.get('/start', async (req, res) => {
    try {
        await messageEngine.startMessaging();
        res.status(200).json({
            status: 'success',
            message: 'Messaging engine started successfully',
            websocket: 'active'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.get('/stop', (req, res) => {
    messageEngine.stopMessaging();
    res.status(200).json({
        status: 'success',
        message: 'Messaging engine stopped successfully'
    });
});

app.get('/status', (req, res) => {
    const status = messageEngine.getStatus();
    res.status(200).json({
        status: 'success',
        data: status
    });
});

app.get('/cookies', (req, res) => {
    const cookieStatus = messageEngine.cookieManager.getCookieStatusReport();
    res.status(200).json({
        status: 'success',
        data: {
            totalCookies: messageEngine.cookieManager.cookies.length,
            cookieStatus
        }
    });
});

app.get('/reload', (req, res) => {
    initializeFiles();
    messageEngine.cookieManager.loadCookies();
    res.status(200).json({
        status: 'success',
        message: 'Configuration files reloaded successfully'
    });
});

// ==================== ENHANCED LOGGING ====================
const originalConsoleLog = console.log;
console.log = function(...args) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${args.join(' ')}`;
    
    // Write to console
    originalConsoleLog.apply(console, [logMessage]);
    
    // Broadcast to WebSocket clients
    wsManager.broadcast({
        type: 'log',
        data: {
            message: logMessage,
            timestamp: Date.now()
        }
    });
};

// ==================== STARTUP ====================
function startServer() {
    console.log('🤖 Initializing R4J M1SHR4 Enhanced Auto-Messenger Server...');
    console.log('🔗 WebSocket Integration: ENABLED');
    
    // Initialize all required files
    initializeFiles();
    
    // Start WebSocket heartbeat
    wsManager.startHeartbeat();
    
    // Validate critical files
    const threadID = readFileContent('convo.txt');
    const messages = readMessages('message.txt');
    const cookies = readMessages('cookies.txt');
    
    if (!threadID) {
        console.log('⚠️ Warning: convo.txt is empty or missing');
    }
    
    if (messages.length === 0) {
        console.log('⚠️ Warning: message.txt is empty or missing');
    }
    
    if (cookies.length === 0) {
        console.log('⚠️ Warning: cookies.txt is empty or missing');
    }
    
    // Start HTTP server with WebSocket
    server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌐 HTTP Access: http://localhost:${PORT}`);
        console.log(`🔗 WebSocket Access: ws://localhost:${PORT}`);
        console.log(`📊 WebSocket Connections: ${wsManager.connections.size}`);
        console.log('========================================');
    });
}

// ==================== PROCESS HANDLING ====================
process.on('SIGINT', () => {
    console.log('\n🛑 Received shutdown signal...');
    messageEngine.stopMessaging();
    wsManager.stopHeartbeat();
    wsManager.broadcast({
        type: 'server_shutdown',
        data: {
            message: 'Server is shutting down',
            timestamp: Date.now()
        }
    });
    
    setTimeout(() => {
        console.log('🔒 Server shutdown complete');
        process.exit(0);
    }, 2000);
});

process.on('uncaughtException', (error) => {
    console.log('❌ Uncaught Exception:', error);
    wsManager.broadcast({
        type: 'error',
        data: {
            error: error.message,
            timestamp: Date.now(),
            type: 'uncaught_exception'
        }
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    wsManager.broadcast({
        type: 'error',
        data: {
            error: reason.toString(),
            timestamp: Date.now(),
            type: 'unhandled_rejection'
        }
    });
});

// ==================== START THE SERVER ====================
startServer();

module.exports = {
    EnhancedMessageEngine,
    AdvancedCookieManager,
    WebSocketManager,
    app,
    server
};
