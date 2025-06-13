// Settings handler script
console.log('Settings handler script loaded');

// Global function to show settings
window.showSettings = function() {
    console.log('Showing settings via global function');
    const settings = document.querySelector('.settings-section-container');
    if (settings) {
        // Force display
        settings.style.display = 'flex';
        settings.style.zIndex = '1000';
        settings.style.position = 'absolute';
        settings.style.top = '0';
        settings.style.right = '0';
        settings.style.bottom = '0';
        settings.style.left = '0';
        settings.style.margin = 'auto';
        settings.style.width = '80%';
        settings.style.height = '80%';
        settings.style.maxHeight = '80vh';
        settings.style.maxWidth = '1000px';
        settings.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
        
        // Initialize theme selection
        initializeThemeSelectors();
        
        console.log('Settings displayed successfully');
    } else {
        console.error('Settings section not found in DOM');
    }
};

// Initialize theme selection
function initializeThemeSelectors() {
    console.log('Initializing theme selectors');
    
    // Get current theme from localStorage or body class
    let currentTheme = localStorage.getItem('theme') || 'light';
    
    // Check body class if localStorage doesn't match
    const currentBodyClass = document.body.className;
    if (currentBodyClass.includes('dark-theme')) {
        currentTheme = 'dark';
    } else if (currentBodyClass.includes('blue-theme')) {
        currentTheme = 'blue';
    } else if (currentBodyClass.includes('system-theme')) {
        currentTheme = 'system';
    }
    
    console.log('Current theme detected:', currentTheme);
    
    // Apply theme if not already applied
    document.body.className = currentTheme + '-theme';
    
    // Save to localStorage to ensure consistency
    localStorage.setItem('theme', currentTheme);
    
    // Select the current theme in UI
    const themePreviewElements = document.querySelectorAll('.theme-preview');
    
    // First remove selected class from all
    themePreviewElements.forEach(preview => {
        preview.classList.remove('selected');
    });
    
    // Then add selected to current theme
    themePreviewElements.forEach(preview => {
        const previewTheme = preview.getAttribute('data-theme');
        
        if (previewTheme === currentTheme) {
            preview.classList.add('selected');
            console.log('Selected theme in UI:', previewTheme);
        }
        
        // Add click handler
        preview.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const theme = this.getAttribute('data-theme');
            console.log('Theme selected:', theme);
            
            // Remove selected class from all previews
            themePreviewElements.forEach(el => {
                el.classList.remove('selected');
            });
            
            // Add selected class to clicked preview
            this.classList.add('selected');
            
            // Apply theme immediately
            document.body.className = theme + '-theme';
            
            // Save theme to localStorage
            localStorage.setItem('theme', theme);
            console.log('Theme saved to localStorage:', theme);
            
            // Update any context menus or other theme-dependent elements
            const contextMenu = document.getElementById('accountContextMenu');
            if (contextMenu) {
                contextMenu.className = 'account-context-menu ' + theme + '-theme';
            }
            
            return false;
        };
    });
}

// Setup handler after DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded in settings handler script');
    
    // Initialize theme from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.className = savedTheme + '-theme';
        console.log('Applied theme from localStorage:', savedTheme);
    }
    
    // Initialize theme selectors even if settings isn't visible
    // This ensures they're ready to use when settings is opened
    initializeThemeSelectors();
    
    // Access settings button
    const settingsBtn = document.getElementById('toggleSettings');
    if (settingsBtn) {
        console.log('Settings button found, attaching direct handler');
        
        // Add direct click handler
        settingsBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Settings button clicked via direct handler');
            window.showSettings();
            return false;
        };
    } else {
        console.error('Settings button not found!');
        
        // Try to find by class if ID doesn't work
        const btnByClass = document.querySelector('.btn-settings');
        if (btnByClass) {
            console.log('Found settings button by class instead');
            btnByClass.onclick = function(e) {
                e.preventDefault();
                console.log('Settings button (by class) clicked');
                window.showSettings();
                return false;
            };
        } else {
            console.error('Settings button not found by class either!');
        }
    }
    
    // Handle close settings button
    const closeSettingsBtn = document.getElementById('closeSettings');
    if (closeSettingsBtn) {
        closeSettingsBtn.onclick = function(e) {
            e.preventDefault();
            console.log('Close settings button clicked');
            
            const settingsSection = document.querySelector('.settings-section-container');
            if (settingsSection) {
                settingsSection.style.display = 'none';
                
                // Show appropriate content
                const accountInfo = document.getElementById('accountInfo');
                const gamesSection = document.getElementById('gamesSection');
                const noAccountSelected = document.getElementById('noAccountSelected');
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
            
            return false;
        };
    }
}); 