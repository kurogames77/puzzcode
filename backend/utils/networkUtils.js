const os = require('os');

/**
 * Get local IP address for the server
 * This is used to allow other devices on the local network to connect
 * @returns {string|null} Local IP address or null if not found
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  // Priority order: look for non-internal IPv4 addresses
  // Prefer Ethernet/WiFi adapters over virtual adapters
  const priorityOrder = ['Wi-Fi', 'Ethernet', 'eth0', 'wlan0', 'en0', 'en1'];
  
  // First, try to find by priority order
  for (const name of priorityOrder) {
    const iface = interfaces[name];
    if (iface) {
      for (const addr of iface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          return addr.address;
        }
      }
    }
  }
  
  // Fallback: find any non-internal IPv4 address
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  
  return null;
}

/**
 * Get all local IP addresses
 * @returns {Array<{name: string, address: string, family: string}>}
 */
function getAllLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push({
          name,
          address: addr.address,
          family: addr.family,
          netmask: addr.netmask
        });
      }
    }
  }
  
  return ips;
}

module.exports = {
  getLocalIP,
  getAllLocalIPs
};

