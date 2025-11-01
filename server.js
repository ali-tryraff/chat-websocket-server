// Simple WebSocket server for chat monitoring
// Receives webhook events and broadcasts to connected clients

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // Optional: for webhook auth

// Store connected WebSocket clients
const clients = new Set();

// Create HTTP server
const server = http.createServer((req, res) => {
  // Webhook endpoint: POST /webhook
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        
        // Optional: Verify webhook secret from headers
        const secretHeader = req.headers['x-cometchat-webhook-secret'];
        if (WEBHOOK_SECRET && secretHeader !== WEBHOOK_SECRET) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        
        // Normalize payload
        const event = {
          type: payload.event || 'onMessageSent',
          appId: payload.appId || 'admin_monitor_webhook',
          timestamp: Date.now(),
          data: payload.data,
        };
        
        // Broadcast to all connected clients
        const message = JSON.stringify(event);
        let sentCount = 0;
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            try {
              client.send(message);
              sentCount++;
            } catch (error) {
              // Client disconnected, remove it
              clients.delete(client);
            }
          }
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'ok', 
          clients: sentCount,
          totalClients: clients.size 
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    // Health check endpoint with CORS
    const origin = req.headers.origin;
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify({ 
      status: 'ok', 
      clients: clients.size,
      uptime: process.uptime() 
    }));
  } else if (req.method === 'OPTIONS') {
    // Handle CORS preflight
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-cometchat-webhook-secret'
    });
    res.end();
  } else if (req.method === 'GET' && req.url === '/') {
    // Root endpoint - info page
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ 
      status: 'ok',
      service: 'Chat WebSocket Server',
      endpoints: {
        webhook: 'POST /webhook',
        health: 'GET /health',
        websocket: 'wss://' + req.headers.host
      },
      clients: clients.size
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', availableEndpoints: ['/health', '/webhook'] }));
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  clients.add(ws);
  
  ws.on('close', () => {
    clients.delete(ws);
  });
  
  ws.on('error', () => {
    clients.delete(ws);
  });
  
  // Send welcome message (optional)
  ws.send(JSON.stringify({ 
    type: 'connected', 
    message: 'WebSocket connection established' 
  }));
});

// Start server
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`Clients: ${clients.size}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

