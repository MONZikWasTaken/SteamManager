const { contextBridge, ipcRenderer } = require('electron');

// Expose electron to the renderer process
contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        // Send messages to the main process
        send: (channel, data) => {
            const validChannels = [
                'app-ready',
                'load-account-games',
                'check-steam-status',
                'open-url',
                'get-settings',
                'update-setting',
                'minimize-window',
                'maximize-window',
                'close-window'
            ];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        
        // Receive messages from the main process
        on: (channel, func) => {
            const validChannels = [
                'loading-update',
                'steam-path-result',
                'steam-accounts-result',
                'account-games-result',
                'settings-values',
                'setting-value',
                'check-steam-status-reply',
                'open-url-reply',
                'window-maximized',
                'switch-account'
            ];
            if (validChannels.includes(channel)) {
                // Remove any existing listeners to avoid duplicates
                ipcRenderer.removeAllListeners(channel);
                // Add the new listener
                ipcRenderer.on(channel, (event, ...args) => func(...args));
            }
        },
        
        // Allow receiving one-time messages from the main process
        once: (channel, func) => {
            const validChannels = [
                'loading-update',
                'steam-path-result',
                'steam-accounts-result',
                'account-games-result',
                'settings-values',
                'setting-value',
                'check-steam-status-reply',
                'open-url-reply'
            ];
            if (validChannels.includes(channel)) {
                // Add the one-time listener
                ipcRenderer.once(channel, (event, ...args) => func(...args));
            }
        },
        
        // Handle invoking methods that return promises
        invoke: (channel, data) => {
            try {
                console.log(`Invoking channel: ${channel} with data:`, data);
                
                const validChannels = [
                    'get-steam-path',
                    'get-steam-accounts',
                    'switch-steam-account'
                ];
                
                if (validChannels.includes(channel)) {
                    return ipcRenderer.invoke(channel, data);
                }
                
                console.error(`Invoke for channel ${channel} is not allowed`);
                return Promise.reject(new Error(`Invoke for channel ${channel} is not allowed`));
            } catch (error) {
                console.error(`Error in invoke for channel ${channel}:`, error);
                return Promise.reject(error);
            }
        }
    }
}); 