// Check if electron IPC is available
const useElectron = window.electron && window.electron.ipcRenderer;

// Window control buttons
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded in renderer.js');
    
    // Check if CSS is loaded correctly
    const styleSheets = Array.from(document.styleSheets);
    console.log('Loaded stylesheets:', styleSheets.map(sheet => sheet.href));
    
    // If in Electron context, ensure CSS files are loaded
    if (useElectron) {
        // If style.css isn't loaded properly, try to load it manually
        const cssLoaded = styleSheets.some(sheet => sheet.href && sheet.href.includes('style.css'));
        if (!cssLoaded) {
            console.log('Manually loading CSS in Electron context');
            const linkElement = document.createElement('link');
            linkElement.rel = 'stylesheet';
            linkElement.href = 'style.css';
            document.head.appendChild(linkElement);
        }
    }

    // Debug DOM elements
    console.log('Debugging DOM elements:');
    console.log('Settings button (.btn-settings):', document.querySelector('.btn-settings'));
    console.log('Settings container (.settings-section-container):', document.querySelector('.settings-section-container'));
    console.log('Account info:', document.getElementById('accountInfo'));
    console.log('Games section:', document.getElementById('gamesSection'));
    console.log('No account selected:', document.getElementById('noAccountSelected'));
    
    // Settings button functionality
    const settingsBtn = document.querySelector('.btn-settings');
    if (settingsBtn) {
        console.log('Found settings button, adding click listener');
        
        // Clear any previous event listeners by using removeEventListener
        settingsBtn.removeEventListener('click', handleSettingsClick);
        
        // Define the click handler function
        function handleSettingsClick(event) {
            console.log('Settings button clicked');
            event.preventDefault();
            event.stopPropagation();
            
            const settingsSection = document.querySelector('.settings-section-container');
            const accountInfo = document.getElementById('accountInfo');
            const gamesSection = document.getElementById('gamesSection');
            const noAccountSelected = document.getElementById('noAccountSelected');
            
            console.log('Current settings display:', settingsSection ? settingsSection.style.display : 'section not found');
            
            if (settingsSection) {
                const isHidden = settingsSection.style.display === 'none' || !settingsSection.style.display;
                console.log('Settings section is hidden:', isHidden);
                
                // Force display style without using cssText which might be causing issues
                if (isHidden) {
                    settingsSection.style.display = 'flex';
                } else {
                    settingsSection.style.display = 'none';
                }
                
                // Update other sections
                if (isHidden) {
                    // Show settings, keep all content visible
                    // Don't modify any content visibility
                    console.log('Showing settings without hiding content');
                } else {
                    // Hide settings, show appropriate section
                    const activeAccount = document.querySelector('.account-item.active');
                    if (activeAccount) {
                        if (accountInfo) accountInfo.style.display = 'block';
                        if (gamesSection) gamesSection.style.display = 'block';
                        if (noAccountSelected) noAccountSelected.style.display = 'none';
                    } else {
                        if (accountInfo) accountInfo.style.display = 'none';
                        if (gamesSection) gamesSection.style.display = 'none';
                        if (noAccountSelected) noAccountSelected.style.display = 'flex';
                    }
                }
                
                console.log('Updated settings display to:', settingsSection.style.display);
            } else {
                console.error('Settings section container not found in the DOM');
            }
        }
        
        // Add the click event listener
        settingsBtn.addEventListener('click', handleSettingsClick);
    } else {
        console.error('Settings button not found in the DOM');
    }
    
    // Minimize button
    const minimizeBtn = document.querySelector('.minimize-btn');
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            if (useElectron) {
                window.electron.ipcRenderer.send('minimize-window');
            }
        });
    }

    // Close button
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (useElectron) {
                window.electron.ipcRenderer.send('close-window');
            }
        });
    }

    // Theme switching - we'll let settings-handler.js handle this
    // to avoid conflicts, but will ensure themes are initialized properly
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.body.className = `${currentTheme}-theme`;
    console.log('Initialized theme from localStorage:', currentTheme);

    console.log('Renderer script loaded successfully');
});

// Make window draggable
document.querySelector('.app-drag-region').style.webkitAppRegion = 'drag'; 