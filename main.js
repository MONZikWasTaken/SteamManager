const { app, BrowserWindow, ipcMain, protocol, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const Store = require('electron-store');
const fetch = require('node-fetch');
const vdf = require('vdf');
const net = require('electron').net;
// Import our new steam account manager
const steamAccountManager = require('./app/static/js/steamAccountManager');

// Create settings store
const store = new Store({
    name: 'user-settings',
    defaults: {
        startWithWindows: false,
        minimizeToTray: false,
        theme: 'light'
    }
});

// Set to true to enable debug mode, false to disable
const DEBUG_MODE = false;

let mainWindow;
let tray = null;

// Track app quitting state
app.isQuitting = false;

// Handle creating/removing shortcuts for Windows
if (require('electron-squirrel-startup')) {
    app.quit();
}

// Set up auto-launch
const AutoLaunch = require('auto-launch');
const autoLauncher = new AutoLaunch({
    name: 'Steam Manager',
    path: app.getPath('exe'),
});

// Update auto-launch based on settings
function updateAutoLaunch() {
    const shouldAutoLaunch = store.get('startWithWindows');
    
    autoLauncher.isEnabled()
        .then((isEnabled) => {
            if (shouldAutoLaunch && !isEnabled) {
                return autoLauncher.enable();
            } else if (!shouldAutoLaunch && isEnabled) {
                return autoLauncher.disable();
            }
        })
        .catch((err) => {
            console.error('Failed to update auto-launch settings:', err);
        });
}

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Set disk cache size to 50MB to reduce memory usage
app.commandLine.appendSwitch('disk-cache-size', String(50 * 1024 * 1024));

// Performance optimization switches
app.commandLine.appendSwitch('expose-gc');
app.commandLine.appendSwitch('max-old-space-size', '256');
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'PersistentStorage,MemoryCache,FastPath');

// Disable CORS for external resources during development (remove in production)
if (DEBUG_MODE) {
  app.commandLine.appendSwitch('disable-web-security');
}

// Set custom user data directory
const userDataPath = path.join(app.getPath('appData'), 'steam-manager');
app.setPath('userData', userDataPath);

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Directory created: ${dirPath}`);
    } catch (err) {
      console.error(`Failed to create directory: ${dirPath}`, err);
    }
  }
}

// Create user data directory
ensureDirectoryExists(userDataPath);

// Create a custom cache directory path
const cachePath = path.join(userDataPath, 'Cache');
ensureDirectoryExists(cachePath);

// Set custom cache path
app.commandLine.appendSwitch('disk-cache-dir', cachePath);

// Register scheme as privileged before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'file', privileges: { bypassCSP: true, secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'app', privileges: { bypassCSP: true, secure: true, standard: true, supportFetchAPI: true } }
]);

// Ensure CSS is copied to templates folder for direct access
function copyCSSToTemplates() {
  const cssSource = path.join(__dirname, 'app', 'static', 'css', 'style.css');
  const cssTarget = path.join(__dirname, 'app', 'templates', 'style.css');
  
  if (fs.existsSync(cssSource)) {
    try {
      fs.copyFileSync(cssSource, cssTarget);
      console.log('CSS copied to templates folder for direct access');
      console.log('Source CSS exists:', fs.existsSync(cssSource));
      console.log('Target CSS exists:', fs.existsSync(cssTarget));
      console.log('CSS file size:', fs.statSync(cssTarget).size, 'bytes');
    } catch (err) {
      console.error('Error copying CSS file:', err);
    }
  } else {
    console.error('CSS source file not found:', cssSource);
  }
}

// Create a tray icon
function createTray() {
    const iconPath = path.join(__dirname, 'app', 'static', 'images', 'tray-icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    
    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Open Steam Manager', 
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            } 
        },
        { type: 'separator' },
        { 
            label: 'Quit', 
            click: () => {
                app.isQuitting = true;
                app.quit();
            } 
        }
    ]);
    
    tray.setToolTip('Steam Manager');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function createWindow() {
  // Copy CSS file before creating window
  copyCSSToTemplates();
  
  // Create tray icon
  createTray();
  
  mainWindow = new BrowserWindow({
    width: 1025,
    height: 866,
    minWidth: 1025,
    minHeight: 866,
    maxWidth: 1400,
    maxHeight: 900,
    frame: false,
    resizable: true, // Enable window resizing
    show: true, // Show window immediately
    backgroundColor: '#ffffff', // Reduces flickering on load
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: !DEBUG_MODE, // Only disable in debug mode
      preload: path.join(__dirname, 'app', 'static', 'js', 'preload.js'),
      // Performance optimizations
      spellcheck: false,
      enableBlinkFeatures: 'FastPath',
      backgroundThrottling: false,
      enablePreferredSizeMode: true,
      devTools: DEBUG_MODE // Only enable DevTools in debug mode
    }
  });

  // Setup IPC for loading status messages
  ipcMain.on('loading-status', (event, status) => {
    console.log('Loading status:', status);
  });
  
  // When content is ready to be shown
  ipcMain.on('app-ready', () => {
    console.log('App is ready');
    // We no longer need to show the window here since it's already visible
  });

  // Only show window when ready to avoid flickering
  mainWindow.once('ready-to-show', () => {
    // Window is ready to show, but we've already shown it
    console.log('Window ready to show');
    
    // Send loading status messages to renderer
    const sendLoadingMessage = (message, progress) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('loading-update', { message, progress });
      }
    };
    
    // Start sending loading messages
    setTimeout(() => sendLoadingMessage('Initializing application...', 10), 300);
    setTimeout(() => sendLoadingMessage('Loading system resources...', 25), 600);
    setTimeout(() => sendLoadingMessage('Preparing user interface...', 40), 900);
    setTimeout(() => sendLoadingMessage('Loading account data...', 60), 1200);
    setTimeout(() => sendLoadingMessage('Finalizing...', 80), 1500);
    setTimeout(() => sendLoadingMessage('Ready!', 100), 1800);
    
    // Optimize renderer process
    if (mainWindow.webContents) {
      // Disable image animations to reduce CPU usage
      mainWindow.webContents.executeJavaScript(`
        document.querySelector('html').style.imageRendering = 'optimizeSpeed';
        document.querySelectorAll('img').forEach(img => {
          img.style.animationPlayState = 'paused';
          img.loading = 'lazy';
        });
      `).catch(console.error);
    }
  });

  // Configure session to handle cache errors
  mainWindow.webContents.session.clearCache().then(() => {
    console.log('Cache cleared successfully');
  }).catch(err => {
    console.error('Error clearing cache:', err);
  });

  // Register custom app protocol with proper promise handling
  protocol.handle('app', async (request) => {
    try {
      const urlObj = new URL(request.url);
      const filePath = path.join(__dirname, 'app', urlObj.pathname);
      console.log('APP Protocol loading:', filePath);
      
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath);
        const contentType = urlObj.pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream';
        
        return new Response(fileContent, {
          headers: {
            'Content-Type': contentType
          }
        });
      } else {
        console.error('File not found:', filePath);
        return new Response('File not found', { status: 404 });
      }
    } catch (error) {
      console.error('Protocol handler error:', error);
      return new Response('Error: ' + error.message, { status: 500 });
    }
  });

  // Check if index.html exists
  const indexPath = path.join(__dirname, 'app', 'templates', 'index.html');
  console.log('Loading index from:', indexPath);
  console.log('File exists:', fs.existsSync(indexPath));

  // Load the main HTML file directly
  mainWindow.loadFile(indexPath);

  // Open DevTools only in debug mode
  if (DEBUG_MODE) {
    mainWindow.webContents.openDevTools();
  }

  // Set up main window event handlers
  setupMainWindowEvents();

  // Handle window controls
  ipcMain.on('minimize-window', () => {
    if (mainWindow) {
      const minimizeToTray = store.get('minimizeToTray');
      if (minimizeToTray) {
        mainWindow.hide();
      } else {
        mainWindow.minimize();
      }
    }
  });

  ipcMain.on('close-window', () => {
    if (mainWindow) {
      const minimizeToTray = store.get('minimizeToTray');
      if (minimizeToTray) {
        mainWindow.hide();
      } else {
        mainWindow.close();
      }
    }
  });
  
  // Update settings from renderer
  ipcMain.on('update-setting', (event, { key, value }) => {
    store.set(key, value);
    
    // If startWithWindows setting changed, update auto-launch
    if (key === 'startWithWindows') {
      updateAutoLaunch();
    }
    
    // Send settings back to renderer
    event.reply('settings-updated', { key, value });
  });

  // Get settings value
  ipcMain.on('get-settings', (event) => {
    event.reply('settings-values', store.store);
  });
  
  // Get specific setting value
  ipcMain.on('get-setting', (event, key) => {
    event.reply('setting-value', { key, value: store.get(key) });
  });

  // Periodic garbage collection to free up memory
  let memoryTimer = null;
  function startMemoryManagement() {
    // Clear any existing timer
    if (memoryTimer) {
      clearInterval(memoryTimer);
    }
    
    // Set up periodic garbage collection when app is idle
    memoryTimer = setInterval(() => {
      if (global.gc) {
        try {
          global.gc();
          console.log('Memory cleaned up');
        } catch (e) {
          console.error('Failed to clean up memory:', e);
        }
      }
    }, 60000); // Run every minute
  }

  // Handle window blur/focus to optimize resource usage
  mainWindow.on('blur', () => {
    mainWindow.webContents.setBackgroundThrottling(true);
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.setBackgroundThrottling(false);
  });

  // Optimize during resize operations
  let resizeTimeout;
  mainWindow.on('resize', () => {
    // During resize, reduce rendering quality
    if (mainWindow.webContents) {
      // Clear any existing timeout
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      
      // Apply low quality rendering during resize
      mainWindow.webContents.executeJavaScript(`
        document.body.classList.add('resizing');
      `).catch(console.error);
      
      // After resize is complete, restore quality
      resizeTimeout = setTimeout(() => {
        mainWindow.webContents.executeJavaScript(`
          document.body.classList.remove('resizing');
        `).catch(console.error);
      }, 300);
    }
  });

  mainWindow.on('closed', () => {
    if (memoryTimer) {
      clearInterval(memoryTimer);
      memoryTimer = null;
    }
    mainWindow = null;
  });

  // Start memory management
  startMemoryManagement();

  // Log loaded files for debugging - fixed URL pattern
  mainWindow.webContents.session.webRequest.onCompleted({
    urls: ['*://*/*', 'file://*/*/*', 'app://*/*']
  }, (details) => {
    console.log('Loaded resource:', details.url, 'Status:', details.statusCode);
  });

  // Also log any failed requests - fixed URL pattern
  mainWindow.webContents.session.webRequest.onErrorOccurred({
    urls: ['*://*/*', 'file://*/*/*', 'app://*/*']
  }, (details) => {
    console.error('Failed to load resource:', details.url, 'Error:', details.error);
  });
}

// Handle errors globally
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Handle Chrome renderer errors
app.on('render-process-gone', (event, webContents, details) => {
  console.error('Renderer process gone:', details.reason);
});

// Handle GPU process errors
app.on('child-process-gone', (event, details) => {
  console.error('Child process gone:', details.type, details.reason);
});

// Call updateAutoLaunch on app ready
app.whenReady().then(() => {
  // Initialize settings if they don't exist
  if (!store.has('startWithWindows')) {
    store.set('startWithWindows', false);
  }
  if (!store.has('minimizeToTray')) {
    store.set('minimizeToTray', false);
  }
  if (!store.has('theme')) {
    store.set('theme', 'light');
  }

  console.log('Setting up IPC handlers...');
  
  // Register IPC handlers
  setupIpcHandlers();
  
  // Test the handlers - verify they're registered
  setTimeout(() => {
    console.log('Testing IPC handlers...');
    const testHandler = ipcMain._handlers && ipcMain._handlers['switch-steam-account'];
    console.log('switch-steam-account handler exists:', testHandler !== undefined);
    
    // Log all registered handlers
    console.log('All registered handlers:', Object.keys(ipcMain._handlers || {}));
  }, 1000);
  
  createWindow();
  updateAutoLaunch();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

// Handle window-all-closed event
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Windows and Linux, keep app running in tray if minimizeToTray is enabled
    if (!store.get('minimizeToTray')) {
      app.quit();
    }
  }
});

// Handle before-quit event (user explicitly asked to quit)
app.on('before-quit', () => {
  // Set quitting flag to true
  app.isQuitting = true;
  
  // Force quit even if minimizeToTray is enabled
  if (mainWindow) {
    mainWindow.removeAllListeners('close');
    mainWindow = null;
  }
  
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

// Override mainWindow close event
function setupMainWindowEvents() {
  if (!mainWindow) return;
  
  mainWindow.on('close', (event) => {
    if (!app.isQuitting && store.get('minimizeToTray')) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });
  
  mainWindow.on('minimize', (event) => {
    if (store.get('minimizeToTray')) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// Add IPC handlers setup function
function setupIpcHandlers() {
    console.log('Setting up IPC handlers...');
    
    // STEAM ACCOUNT MANAGEMENT HANDLERS
    ipcMain.handle('switch-steam-account', async (event, accountName) => {
        try {
            console.log('Received switch-steam-account request for:', accountName);
            if (!accountName) {
                return { success: false, error: 'Account name is required' };
            }
            
            const success = await steamAccountManager.switchSteamAccount(accountName);
            return { success, message: success ? 'Account switched successfully' : 'Failed to switch account' };
        } catch (error) {
            console.error('Error switching Steam account:', error);
            return { success: false, error: error.message };
        }
    });
    
    ipcMain.handle('get-steam-path', async () => {
        try {
            const steamPath = await steamAccountManager.getSteamPath();
            return { success: true, path: steamPath };
        } catch (error) {
            console.error('Error getting Steam path:', error);
            return { success: false, error: error.message };
        }
    });
    
    ipcMain.handle('get-steam-accounts', async () => {
        try {
            const steamPath = await steamAccountManager.getSteamPath();
            if (!steamPath) {
                return { success: false, error: 'Steam path not found' };
            }
            
            const accounts = await steamAccountManager.getSteamAccounts(steamPath);
            return { success: true, accounts };
        } catch (error) {
            console.error('Error getting Steam accounts:', error);
            return { success: false, error: error.message };
        }
    });
    
    // Update settings from renderer
    ipcMain.on('update-setting', (event, { key, value }) => {
        store.set(key, value);
        
        // If startWithWindows setting changed, update auto-launch
        if (key === 'startWithWindows') {
            updateAutoLaunch();
        }
        
        // Send settings back to renderer
        event.reply('settings-updated', { key, value });
    });

    // Get settings value
    ipcMain.on('get-settings', (event) => {
        event.reply('settings-values', store.store);
    });
    
    // Get specific setting value
    ipcMain.on('get-setting', (event, key) => {
        event.reply('setting-value', { key, value: store.get(key) });
    });

    // Log all registered IPC handlers for debugging
    console.log('IPC Handlers registered:');
    console.log('- ipcMain.handle channels:', Object.keys(ipcMain._handlers || {}));
    console.log('- Regular IPC channels (partial):', 'update-setting, get-settings, get-setting');
} 