import { io, Socket } from 'socket.io-client';

// Detect API base URL - use current host if on local network, otherwise use env or localhost
function getApiBaseUrl(): string {
  // If environment variable is set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // If running in browser, detect if we're on a local network IP
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Check if hostname is a local IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x, or localhost)
    const isLocalNetwork = hostname === 'localhost' || 
                          hostname === '127.0.0.1' ||
                          /^192\.168\./.test(hostname) ||
                          /^10\./.test(hostname) ||
                          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
    
    if (isLocalNetwork) {
      // Use the same hostname but with backend port (3001)
      return `http://${hostname}:3001`;
    }
  }

  // Default fallback
  return 'http://localhost:3001';
}

const API_BASE_URL = getApiBaseUrl();

/**
 * WebSocket Client for Real-time Multiplayer
 */
class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, Set<Function>> = new Map();
  private isConnected = false;

  /**
   * Connect to WebSocket server
   */
  connect(token: string, localIP?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Determine WebSocket URL
      let wsUrl = API_BASE_URL;
      if (localIP) {
        // Use local IP if provided (for local network connections)
        const url = new URL(API_BASE_URL);
        wsUrl = `${url.protocol}//${localIP}:${url.port || '3001'}`;
      }

      this.socket = io(wsUrl, {
        auth: {
          token
        },
        transports: ['websocket', 'polling'], // Fallback to polling if WebSocket fails
        reconnection: true,
        reconnectionDelay: this.reconnectDelay,
        reconnectionAttempts: this.maxReconnectAttempts
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('✅ WebSocket connected');
        
        // Re-register all existing listeners with the new socket connection
        for (const [event, callbacks] of this.listeners.entries()) {
          for (const callback of callbacks) {
            this.socket!.on(event, callback);
          }
        }
        
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        this.isConnected = false;
        console.log('❌ WebSocket disconnected:', reason);
        
        // Emit disconnect event to all listeners
        this.emitToListeners('disconnect', { reason });
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ WebSocket connection error:', error);
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Failed to connect to WebSocket server after multiple attempts'));
        } else {
          // Will auto-reconnect
          this.emitToListeners('connect_error', { error: error.message });
        }
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log('🔄 WebSocket reconnected after', attemptNumber, 'attempts');
        this.isConnected = true;
        this.emitToListeners('reconnect', { attemptNumber });
      });

      // Forward all events to registered listeners
      // Use onAny to catch all events, including custom ones
      if (typeof this.socket.onAny === 'function') {
        this.socket.onAny((eventName, ...args) => {
          this.emitToListeners(eventName, ...args);
        });
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.listeners.clear();
    }
  }

  /**
   * Check if connected
   */
  connected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Emit event to server
   */
  emit(event: string, data?: any) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    } else {
      console.warn('⚠️ WebSocket not connected. Event not sent:', event);
    }
  }

  /**
   * Register event listener
   */
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Also register with socket if connected
    if (this.socket) {
      this.socket.on(event, callback);
    } else {
      // If socket not ready yet, the callback will be registered when socket connects
      // (handled in connect() method)
    }
  }

  /**
   * Remove event listener
   */
  off(event: string, callback?: Function) {
    if (this.listeners.has(event)) {
      if (callback) {
        this.listeners.get(event)!.delete(callback);
      } else {
        this.listeners.delete(event);
      }
    }

    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }

  /**
   * Emit to all registered listeners for an event
   */
  private emitToListeners(event: string, ...args: any[]) {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error('Error in WebSocket listener:', error);
        }
      });
    }
  }

  /**
   * Get socket ID
   */
  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

// Singleton instance
let wsClientInstance: WebSocketClient | null = null;

/**
 * Get WebSocket client instance
 */
export function getWebSocketClient(): WebSocketClient {
  if (!wsClientInstance) {
    wsClientInstance = new WebSocketClient();
  }
  return wsClientInstance;
}

/**
 * Initialize WebSocket connection
 */
export async function initWebSocket(token: string, localIP?: string): Promise<WebSocketClient> {
  const client = getWebSocketClient();
  if (!client.connected()) {
    await client.connect(token, localIP);
  }
  return client;
}

/**
 * Get local IP from server
 */
export async function getLocalIP(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/network/local-ip`);
    const data = await response.json();
    return data.localIP || null;
  } catch (error) {
    console.error('Failed to get local IP:', error);
    return null;
  }
}

export default getWebSocketClient;

