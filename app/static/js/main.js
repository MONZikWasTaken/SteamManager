const { app, BrowserWindow, ipcMain, protocol, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const Store = require('electron-store');
const vdf = require('vdf');
const Registry = require('winreg');
const AutoLaunch = require('auto-launch');
const { exec } = require('child_process');

// Handle Windows installer events
if (process.platform === 'win32') {
    const squirrelHandler = require('./squirrel.js');
    if (squirrelHandler()) {
        app.quit();
        process.exit(0);
    }
}

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
const DEBUG_MODE = true;

let mainWindow;
let tray = null;

// Track app quitting state
app.isQuitting = false;

// Handle creating/removing shortcuts for Windows
if (require('electron-squirrel-startup')) {
    app.quit();
}

// Set up auto-launch
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

// Only execute this code in a browser/renderer context
if (typeof document !== 'undefined') {
    // Apply saved theme immediately when script loads
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.className = savedTheme + '-theme';
    console.log('Applied theme from localStorage in main.js:', savedTheme);
    
    // Theme handling
    document.addEventListener('DOMContentLoaded', () => {
        console.log("DOM content loaded in main.js");
        
        // Initialize settings section visibility
        const settingsSection = document.querySelector('.settings-section-container');
        if (settingsSection) {
            console.log("Found settings section, ensuring it's hidden by default");
            settingsSection.style.display = 'none';
        }
        
        // Set up settings button click handler with direct manipulation
        const settingsBtn = document.getElementById('toggleSettings');
        if (settingsBtn) {
            console.log("Found settings button, setting up direct click handler");
            
            // Remove any existing handlers to avoid duplicates
            settingsBtn.onclick = null;
            
            // Add direct onclick handler
            settingsBtn.onclick = function(e) {
                e.preventDefault();
                console.log("Settings button clicked from main.js");
                
                const settingsSection = document.querySelector('.settings-section-container');
                if (settingsSection) {
                    const isHidden = settingsSection.style.display === 'none' || !settingsSection.style.display;
                    
                    console.log("Current settings visibility:", settingsSection.style.display);
                    console.log("isHidden:", isHidden);
                    
                    // Show/hide settings section - force flex display
                    settingsSection.style.display = 'flex';
                    
                    // Update visibility of other sections
                    const accountInfo = document.getElementById('accountInfo');
                    const gamesSection = document.getElementById('gamesSection');
                    const noAccountSelected = document.getElementById('noAccountSelected');
                    
                    if (isHidden) {
                        // Show settings, hide others
                        if (accountInfo) accountInfo.style.display = 'none';
                        if (gamesSection) gamesSection.style.display = 'none';
                        if (noAccountSelected) noAccountSelected.style.display = 'none';
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
                    
                    console.log('Settings visibility after toggle:', settingsSection.style.display);
                } else {
                    console.error("Settings section not found in the DOM");
                }
                
                return false;
            };
        } else {
            console.error("Settings button with ID 'toggleSettings' not found");
        }
        
        // Handle close settings button
        const closeSettingsBtn = document.getElementById('closeSettings');
        if (closeSettingsBtn) {
            console.log("Found close settings button, setting up handler");
            
            closeSettingsBtn.onclick = function(e) {
                e.preventDefault();
                console.log("Close settings button clicked");
                
                const settingsSection = document.querySelector('.settings-section-container');
                if (settingsSection) {
                    // Hide settings section
                    settingsSection.style.display = 'none';
                    
                    // Show appropriate sections
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
                    
                    console.log('Settings hidden after close button clicked');
                }
                
                return false;
            };
        } else {
            console.error("Close settings button with ID 'closeSettings' not found");
        }

        // Handle theme toggle buttons if they exist
        const themeButtons = document.querySelectorAll('.theme-btn');
        themeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                document.body.className = `${theme}-theme`;
            });
        });

        // Handle view toggle buttons if they exist
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                viewButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const view = btn.dataset.view;
                const container = document.querySelector('.games-container');
                if (container) {
                    container.className = `games-container ${view}-view`;
                    
                    // Update game items based on view
                    const activeAccount = document.querySelector('.account-item.active');
                    if (activeAccount) {
                        const accountId = activeAccount.dataset.accountId;
                        updateGames(accountsData[accountId].games);
                    }
                }
            });
        });

        // Handle account selection if accounts exist
        const accountItems = document.querySelectorAll('.account-item');
        accountItems.forEach(item => {
            item.addEventListener('click', () => {
                const accountId = item.dataset.accountId;
                selectAccount(accountId);
            });
        });

        // Add this in the document.addEventListener('DOMContentLoaded', function() { ... }) block
        if (window.electron) {
            window.electron.ipcRenderer.on('switch-account', (steamId) => {
                // Find and click the account item
                const accountItem = document.querySelector(`.account-item[data-account-id="${steamId}"]`);
                if (accountItem) {
                    accountItem.click();
                }
            });
        }
    });

    // Helper function to generate skeleton loading items
    function generateSkeletonGames(count) {
        return ''; // No skeleton loading needed anymore
    }

    // Function to load games (no longer using dummy data)
    function loadGames() {
        if (typeof document === 'undefined') return;
        
        const activeAccount = document.querySelector('.account-item.active');
        if (activeAccount) {
            const accountId = activeAccount.dataset.accountId;
            if (accountsData[accountId] && accountsData[accountId].games) {
                updateGames(accountsData[accountId].games);
            }
        }
    }

    // Mock data for accounts
    const accountsData = {};

    // Global pagination state
    let paginationState = {
        currentPage: 1,
        gamesPerPage: 6,
        totalPages: 1,
        totalGames: 0,
        currentGames: [],
        allGames: [],
        searchQuery: ''
    };

    // Function to select an account
    function selectAccount(accountId) {
        if (typeof document === 'undefined') return;
        
        // Remove active class from all account items
        document.querySelectorAll('.account-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to selected account item
        const selectedItem = document.querySelector(`.account-item[data-account-id="${accountId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
        }
        
        // Get account data
        const account = accountsData[accountId];
        if (!account) return;
        
        // Update account info
        updateAccountInfo(account);
        
        // Update games list
        updateGames(account.games);
        
        // Hide settings if open
        const settingsSection = document.querySelector('.settings-section-container');
        if (settingsSection) {
            settingsSection.style.display = 'none';
        }
        
        // Show account info and games sections, hide no account selected
        const noAccountSelected = document.getElementById('noAccountSelected');
        const accountInfo = document.getElementById('accountInfo');
        const gamesSection = document.getElementById('gamesSection');
        
        if (noAccountSelected) noAccountSelected.style.display = 'none';
        if (accountInfo) accountInfo.style.display = 'block';
        if (gamesSection) gamesSection.style.display = 'block';
    }

    // Function to update account info
    function updateAccountInfo(account) {
        if (typeof document === 'undefined') return;
        
        // Update avatar
        const avatarElement = document.getElementById('accountAvatar');
        if (avatarElement) {
            const avatarUrl = account.avatar || 'https://avatars.steamstatic.com/b5bd56c1aa4644a474a2e4972be27ef9e82e517e_full.jpg';
            avatarElement.style.backgroundImage = `url('${avatarUrl}')`;
        }
        
        // Update nickname and status
        const nicknameElement = document.getElementById('accountNickname');
        if (nicknameElement) nicknameElement.textContent = account.nickname;
        
        const statusElement = document.getElementById('accountStatus');
        if (statusElement) {
            statusElement.textContent = account.status.charAt(0).toUpperCase() + account.status.slice(1);
            statusElement.className = `account-status ${account.status}`;
        }
        
        // Update account details
        const loginElement = document.getElementById('accountLogin');
        if (loginElement) loginElement.textContent = account.email;
        
        const idElement = document.getElementById('accountId');
        if (idElement) idElement.textContent = account.steamId;
        
        // Update stats
        const gamesCountElement = document.getElementById('gamesCount');
        if (gamesCountElement) gamesCountElement.textContent = account.stats.games;
        
        const friendsCountElement = document.getElementById('friendsCount');
        if (friendsCountElement) friendsCountElement.textContent = account.stats.friends;
        
        const hoursCountElement = document.getElementById('hoursCount');
        if (hoursCountElement) hoursCountElement.textContent = account.stats.hours;
    }

    // Function to update games list with pagination
    function updateGames(games) {
        if (typeof document === 'undefined') return;
        
        // Store all games for pagination and search
        paginationState.totalGames = games.length;
        paginationState.allGames = games;
        paginationState.currentGames = games;
        paginationState.searchQuery = '';
        
        // Reset to first page when games list changes
        paginationState.currentPage = 1;
        
        // Reset search input if it exists
        const searchInput = document.getElementById('gameSearch');
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Calculate total pages
        updatePaginationInfo();
        
        // Render current page
        renderCurrentPage();
    }

    // Function to search games
    function searchGames(query) {
        if (typeof document === 'undefined') return;
        
        paginationState.searchQuery = query.toLowerCase();
        
        if (query.trim() === '') {
            // If search is empty, show all games
            paginationState.currentGames = paginationState.allGames;
        } else {
            // Normalize the search query - remove special characters and extra spaces
            const normalizedQuery = query.toLowerCase()
                .replace(/[^\w\s]/gi, '') // Remove special characters
                .replace(/\s+/g, ' ')     // Replace multiple spaces with single space
                .trim();
                
            // Split into words for multi-word search
            const searchTerms = normalizedQuery.split(' ').filter(term => term.length > 0);
            
            // Filter games based on search query with smart matching
            paginationState.currentGames = paginationState.allGames.filter(game => {
                // Normalize the game title
                const normalizedTitle = game.title.toLowerCase()
                    .replace(/[^\w\s]/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                    
                // Check if all search terms are found in the title
                if (searchTerms.every(term => normalizedTitle.includes(term))) {
                    return true;
                }
                
                // Check for acronym match (e.g., "CS" matches "Counter-Strike")
                if (searchTerms.length === 1 && searchTerms[0].length > 1) {
                    const acronym = game.title.split(/\s+/)
                        .map(word => word[0] || '')
                        .join('')
                        .toLowerCase();
                        
                    if (acronym.includes(searchTerms[0])) {
                        return true;
                    }
                }
                
                return false;
            });
        }
        
        // Update pagination and render
        updatePaginationInfo();
        renderCurrentPage();
    }

    // Function to update pagination info
    function updatePaginationInfo() {
        if (paginationState.gamesPerPage === 'all') {
            paginationState.totalPages = 1;
        } else {
            paginationState.totalPages = Math.ceil(paginationState.totalGames / paginationState.gamesPerPage);
        }
        
        // Update pagination UI
        const currentEl = document.querySelector('.pagination-current');
        const totalEl = document.querySelector('.pagination-total');
        if (currentEl) currentEl.textContent = paginationState.currentPage;
        if (totalEl) totalEl.textContent = paginationState.totalPages;
        
        // Enable/disable pagination buttons
        const prevBtn = document.querySelector('.pagination-prev');
        const nextBtn = document.querySelector('.pagination-next');
        
        if (prevBtn) prevBtn.disabled = paginationState.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = paginationState.currentPage >= paginationState.totalPages;
    }

    // Function to render current page of games
    function renderCurrentPage() {
        const container = document.getElementById('gamesContainer');
        container.innerHTML = '';
        
        const currentView = container.classList.contains('grid-view') ? 'grid' : 'list';
        
        // Get games for current page
        let gamesToRender;
        if (paginationState.gamesPerPage === 'all') {
            gamesToRender = paginationState.currentGames;
        } else {
            const startIndex = (paginationState.currentPage - 1) * paginationState.gamesPerPage;
            const endIndex = Math.min(startIndex + paginationState.gamesPerPage, paginationState.totalGames);
            gamesToRender = paginationState.currentGames.slice(startIndex, endIndex);
        }
        
        // Render games
        gamesToRender.forEach((game, index) => {
            const gameItem = document.createElement('div');
            gameItem.className = 'game-item';
            
            // Add search result animation with staggered delay
            if (paginationState.searchQuery) {
                gameItem.classList.add('search-result');
                gameItem.style.animationDelay = `${index * 0.05}s`;
            }
            
            // Highlight search term in title if there's a search query
            let highlightedTitle = game.title;
            if (paginationState.searchQuery) {
                highlightedTitle = highlightSearchTerms(game.title, paginationState.searchQuery);
            }
            
            if (currentView === 'grid') {
                gameItem.innerHTML = `
                    <div class="game-image">
                        <div class="game-status ${game.installed ? 'installed' : 'not-installed'}">
                            ${game.installed ? 'Installed' : 'Not Installed'}
                        </div>
                    </div>
                    <div class="game-info">
                        <h4>${highlightedTitle}</h4>
                        <p>Playtime: ${game.playtime}</p>
                        <p>Last played: ${game.lastPlayed}</p>
                        <div class="game-actions">
                            <button class="btn-play">${game.installed ? 'Play' : 'Install'}</button>
                        </div>
                    </div>
                `;
            } else {
                gameItem.innerHTML = `
                    <div class="game-image"></div>
                    <div class="game-info">
                        <div class="game-title-container">
                            <div class="game-title">${highlightedTitle}</div>
                            <div class="game-status ${game.installed ? 'installed' : 'not-installed'}">
                                ${game.installed ? 'Installed' : 'Not Installed'}
                            </div>
                        </div>
                        <div class="game-meta">
                            <div>Playtime: ${game.playtime}</div>
                            <div>Last played: ${game.lastPlayed}</div>
                        </div>
                    </div>
                    <div class="game-actions">
                        <button class="btn-play">${game.installed ? 'Play' : 'Install'}</button>
                    </div>
                `;
            }
            
            container.appendChild(gameItem);
        });
    }

    // Helper function to escape special characters in regex
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Helper function to highlight search terms in text
    function highlightSearchTerms(text, searchQuery) {
        if (!searchQuery || searchQuery.trim() === '') {
            return text;
        }
        
        // Normalize the search query
        const normalizedQuery = searchQuery.toLowerCase()
            .replace(/[^\w\s]/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
            
        // Split into words for multi-word highlighting
        const searchTerms = normalizedQuery.split(' ').filter(term => term.length > 0);
        
        let highlightedText = text;
        
        // Create a regex that matches any of the search terms
        const regexParts = searchTerms.map(term => escapeRegExp(term));
        const regex = new RegExp(`(${regexParts.join('|')})`, 'gi');
        
        // Replace matches with highlighted spans
        highlightedText = text.replace(regex, '<span class="search-highlight">$1</span>');
        
        return highlightedText;
    }

    // Initialize the app
    document.addEventListener('DOMContentLoaded', function() {
        // Handle pagination
        const prevBtn = document.querySelector('.pagination-prev');
        const nextBtn = document.querySelector('.pagination-next');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (paginationState.currentPage > 1) {
                    paginationState.currentPage--;
                    updatePaginationInfo();
                    renderCurrentPage();
                }
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (paginationState.currentPage < paginationState.totalPages) {
                    paginationState.currentPage++;
                    updatePaginationInfo();
                    renderCurrentPage();
                }
            });
        }
        
        // Handle games per page selection
        const gamesPerPageSelect = document.getElementById('gamesPerPage');
        if (gamesPerPageSelect) {
            gamesPerPageSelect.addEventListener('change', function() {
                paginationState.gamesPerPage = this.value === 'all' ? 'all' : parseInt(this.value);
                paginationState.currentPage = 1;
                updatePaginationInfo();
                renderCurrentPage();
            });
        }

        // Handle Select Account button on home page
        const selectAccountBtn = document.querySelector('.btn-select-account');
        if (selectAccountBtn) {
            selectAccountBtn.addEventListener('click', function() {
                // Highlight the accounts sidebar with a pulse animation
                const accountsSidebar = document.querySelector('.accounts-sidebar');
                accountsSidebar.classList.add('highlight-sidebar');
                
                // Remove the highlight after animation completes
                setTimeout(() => {
                    accountsSidebar.classList.remove('highlight-sidebar');
                }, 2000);
            });
        }

        // Toggle account visibility menu
        const toggleVisibilityBtn = document.getElementById('toggleVisibility');
        const visibilityMenu = document.getElementById('visibilityMenu');
        const visibilityOverlay = document.getElementById('visibilityOverlay');
        const closeVisibilityMenuBtn = document.getElementById('closeVisibilityMenu');
        
        if (toggleVisibilityBtn && visibilityMenu && visibilityOverlay) {
            toggleVisibilityBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                visibilityMenu.classList.toggle('active');
                visibilityOverlay.classList.toggle('active');
                document.body.style.overflow = 'hidden'; // Prevent scrolling when menu is open
            });
            
            // Close menu when clicking on overlay
            visibilityOverlay.addEventListener('click', function() {
                visibilityMenu.classList.remove('active');
                visibilityOverlay.classList.remove('active');
                document.body.style.overflow = ''; // Restore scrolling
            });
            
            // Close menu with close button
            if (closeVisibilityMenuBtn) {
                closeVisibilityMenuBtn.addEventListener('click', function() {
                    visibilityMenu.classList.remove('active');
                    visibilityOverlay.classList.remove('active');
                    document.body.style.overflow = ''; // Restore scrolling
                });
            }
            
            // Handle visibility checkboxes
            const visibilityCheckboxes = document.querySelectorAll('.visibility-checkbox');
            visibilityCheckboxes.forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    const accountId = this.closest('.visibility-item').dataset.accountId;
                    const accountItem = document.querySelector(`.account-item[data-account-id="${accountId}"]`);
                    
                    if (this.checked) {
                        accountItem.style.display = 'block';
                    } else {
                        accountItem.style.display = 'none';
                        
                        // If hiding the active account, show "No Account Selected"
                        if (accountItem.classList.contains('active')) {
                            accountItem.classList.remove('active');
                            document.getElementById('accountInfo').style.display = 'none';
                            document.getElementById('gamesSection').style.display = 'none';
                            document.getElementById('noAccountSelected').style.display = 'flex';
                        }
                    }
                });
            });
        }

        // Toggle switches
        const toggles = document.querySelectorAll('.toggle-switch');
        toggles.forEach(toggle => {
            toggle.addEventListener('click', function() {
                this.classList.toggle('active');
                // Here you would add code to save the toggle state
            });
        });

        // Theme selection
        const themePreviewElements = document.querySelectorAll('.theme-preview');
        themePreviewElements.forEach(preview => {
            preview.addEventListener('click', function() {
                const theme = this.getAttribute('data-theme');
                
                // Remove selected class from all previews
                themePreviewElements.forEach(el => el.classList.remove('selected'));
                
                // Add selected class to clicked preview
                this.classList.add('selected');
                
                // Apply theme immediately
                document.body.className = '';
                document.body.classList.add(theme + '-theme');
                
                // Save theme to localStorage
                localStorage.setItem('theme', theme);
                console.log('Theme saved to localStorage:', theme);
                
                // Update context menu theme if it exists
                const contextMenu = document.getElementById('accountContextMenu');
                if (contextMenu) {
                    contextMenu.className = 'account-context-menu';
                    contextMenu.classList.add(theme + '-theme');
                }
            });
        });

        // App control buttons functionality
        const minimizeBtn = document.querySelector('.minimize-btn');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', function() {
                // In a real electron app, this would minimize the window
                console.log('Minimize button clicked');
            });
        }

        // Close button
        const closeBtn = document.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                // In a real electron app, this would close the window
                console.log('Close button clicked');
            });
        }

        // Show no account selected by default
        document.getElementById('noAccountSelected').style.display = 'flex';
        document.getElementById('accountInfo').style.display = 'none';
        document.getElementById('gamesSection').style.display = 'none';
        
        // Handle search functionality
        const searchIconBtn = document.getElementById('searchIconBtn');
        const searchInputContainer = document.getElementById('searchInputContainer');
        const searchInput = document.getElementById('gameSearch');
        const searchCloseBtn = document.getElementById('searchCloseBtn');
        
        if (searchIconBtn && searchInputContainer && searchInput) {
            // Show search input when icon is clicked
            searchIconBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation(); // Prevent event bubbling
                
                // Force display to ensure it's visible
                searchInputContainer.style.display = 'flex';
                
                // Position the search input container correctly
                const searchIconRect = searchIconBtn.getBoundingClientRect();
                const searchContainerRect = searchIconBtn.closest('.search-container').getBoundingClientRect();
                
                // Ensure the search input is properly positioned
                searchInputContainer.style.top = '0px';
                searchInputContainer.style.right = '0px';
                
                // Use requestAnimationFrame to ensure the DOM has updated
                requestAnimationFrame(() => {
                    searchInputContainer.classList.add('active');
                    searchIconBtn.style.display = 'none';
                    
                    // Focus after animation starts
                    setTimeout(() => {
                        searchInput.focus();
                    }, 100);
                });
            });
            
            // Hide search input when close button is clicked
            if (searchCloseBtn) {
                searchCloseBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation(); // Prevent event bubbling
                    closeSearch();
                });
            }
            
            // Handle search input with debounce for better performance
            let searchTimeout;
            searchInput.addEventListener('input', function() {
                clearTimeout(searchTimeout);
                
                // Show loading indicator
                const gamesContainer = document.getElementById('gamesContainer');
                if (gamesContainer) {
                    gamesContainer.classList.add('searching');
                }
                
                searchTimeout = setTimeout(() => {
                    searchGames(this.value);
                    
                    // Remove loading indicator
                    if (gamesContainer) {
                        gamesContainer.classList.remove('searching');
                    }
                }, 300); // 300ms debounce
            });
            
            // Handle keyboard shortcuts
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    closeSearch();
                }
            });
            
            // Hide search input when clicked outside
            document.addEventListener('click', function(e) {
                if (!searchInputContainer.contains(e.target) && 
                    e.target !== searchIconBtn && 
                    !searchInput.value) {
                    closeSearch();
                }
            });
            
            // Prevent hiding when clicking inside search input
            searchInputContainer.addEventListener('click', function(e) {
                e.stopPropagation();
            });
            
            // Function to close search
            function closeSearch() {
                searchInputContainer.classList.remove('active');
                
                // Wait for animation to complete before hiding
                setTimeout(() => {
                    searchIconBtn.style.display = 'flex';
                    
                    // Clear search and show all games
                    if (searchInput.value) {
                        searchInput.value = '';
                        searchGames('');
                    }
                }, 200);
            }
        }

        // Remove the old updateGameItemsStructure function that used dummy data
        if (window.updateGameItemsStructure) {
            delete window.updateGameItemsStructure;
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1025,
        height: 866,
        minWidth: 1025,
        minHeight: 866,
        frame: false,
        resizable: true,
        show: true,
        backgroundColor: '#ffffff',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js'),
            spellcheck: false,
            enableBlinkFeatures: 'FastPath',
            backgroundThrottling: false,
            enablePreferredSizeMode: true,
            devTools: true
        }
    });

    // Set Content-Security-Policy
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com; connect-src 'self'"]
            }
        });
    });

    mainWindow.loadFile(path.join(__dirname, '../../templates/index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
    
    // Track window state changes
    mainWindow.on('maximize', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('window-maximized', true);
        }
    });

    mainWindow.on('unmaximize', () => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('window-maximized', false);
        }
    });

    // Handle minimize event
    mainWindow.on('minimize', (event) => {
        if (store.get('minimizeToTray')) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Handle close event
    mainWindow.on('close', (event) => {
        if (!app.isQuitting && store.get('minimizeToTray')) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    // Create tray if it doesn't exist
    if (!tray) {
        createTray();
    }

    return mainWindow;
}

app.whenReady().then(() => {
    try {
        mainWindow = createWindow();
        
        app.on('activate', function () {
            if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createWindow();
            }
        });
    } catch (error) {
        console.error('Error creating window:', error);
    }
}).catch(error => {
    console.error('Error in app ready:', error);
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for window controls
ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.restore();
            mainWindow.webContents.send('window-maximized', false);
        } else {
            mainWindow.maximize();
            mainWindow.webContents.send('window-maximized', true);
        }
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
});

// Steam account management IPC handlers
ipcMain.handle('switch-steam-account', async (event, accountName) => {
    try {
        console.log('Received switch-steam-account request for:', accountName);
        if (!accountName) {
            return { success: false, error: 'Account name is required' };
        }
        
        // Get Steam path
        const steamPath = await getSteamPath();
        if (!steamPath) {
            return { success: false, error: 'Steam path not found. Make sure Steam is installed.' };
        }
        
        // Import the Steam account manager
        const steamAccountManager = require('./steamAccountManager');
        
        // Get the result of the account switch operation
        const result = await steamAccountManager.switchSteamAccount(accountName);
        
        // Pass the detailed result from the steamAccountManager
        if (result.success) {
            return { 
                success: true,
                message: result.message || `Account "${accountName}" set as auto-login. Steam has been launched with this account.`,
                registrySet: result.registrySet,
                steamStarted: result.steamStarted,
                loginVerified: result.loginVerified
            };
        } else {
            return { 
                success: false, 
                error: result.error || 'Failed to switch account. Check the console for more details.' 
            };
        }
    } catch (error) {
        console.error('Error switching Steam account:', error);
        return { 
            success: false, 
            error: `Error: ${error.message || 'Unknown error occurred'}` 
        };
    }
});

ipcMain.handle('get-steam-path', async () => {
    try {
        const steamPath = await getSteamPath();
        return { success: true, path: steamPath };
    } catch (error) {
        console.error('Error getting Steam path:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-steam-accounts', async () => {
    try {
        const steamPath = await getSteamPath();
        if (!steamPath) {
            return { success: false, error: 'Steam path not found' };
        }
        
        // Import the Steam account manager
        const steamAccountManager = require('./steamAccountManager');
        
        const accounts = await steamAccountManager.getSteamAccounts(steamPath);
        return { success: true, accounts };
    } catch (error) {
        console.error('Error getting Steam accounts:', error);
        return { success: false, error: error.message };
    }
});

// Load Steam accounts when the app is ready
ipcMain.on('app-ready', async () => {
    try {
        // Send loading update
        mainWindow.webContents.send('loading-update', {
            progress: 30,
            message: "Finding Steam installation..."
        });

        // Get Steam installation path
        const steamPath = await getSteamPath();
        mainWindow.webContents.send('loading-update', {
            progress: 40,
            message: `Found Steam: ${steamPath}`
        });

        // Load accounts
        mainWindow.webContents.send('loading-update', {
            progress: 60,
            message: "Loading Steam accounts..."
        });
        
        const accounts = await getSteamAccounts(steamPath);
        
        mainWindow.webContents.send('loading-update', {
            progress: 80,
            message: `Loaded ${accounts.length} Steam accounts`
        });
        
        // Send accounts to renderer
        mainWindow.webContents.send('steam-accounts-result', {
            success: true,
            accounts
        });
        
        mainWindow.webContents.send('loading-update', {
            progress: 100,
            message: "Ready!"
        });
    } catch (error) {
        console.error('Error loading accounts:', error);
        mainWindow.webContents.send('loading-update', {
            progress: 100,
            message: "Failed to load Steam accounts"
        });
        mainWindow.webContents.send('steam-accounts-result', {
            success: false,
            error: error.message
        });
    }
});

// Get Steam installation path from the registry
ipcMain.on('get-steam-path', async (event) => {
    try {
        const steamPath = await getSteamPath();
        mainWindow.webContents.send('steam-path-result', { 
            success: true, 
            path: steamPath 
        });
    } catch (error) {
        console.error('Error getting Steam path:', error);
        mainWindow.webContents.send('steam-path-result', { 
            success: false,
            error: error.message
        });
    }
});

// Load account games
ipcMain.on('load-account-games', async (event, { steamId, steamPath }) => {
    try {
        const games = await getAccountGames(steamId, steamPath);
        mainWindow.webContents.send('account-games-result', { 
            success: true, 
            steamId,
            games 
        });
    } catch (error) {
        console.error('Error loading account games:', error);
        mainWindow.webContents.send('account-games-result', { 
            success: false,
            steamId,
            error: error.message
        });
    }
});

// Add the toggle-devtools handler after the other IPC handlers
ipcMain.on('toggle-devtools', () => {
  if (mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools();
    }
  }
});

// Function to get Steam installation path from Windows registry
function getSteamPath() {
    return new Promise((resolve, reject) => {
        // For Windows, check the registry
        if (process.platform === 'win32') {
            const regKey = new Registry({
                hive: Registry.HKLM,
                key: '\\SOFTWARE\\WOW6432Node\\Valve\\Steam'
            });

            regKey.get('InstallPath', (err, item) => {
                if (err) {
                    // Try the non-WOW6432Node path
                    const regKeyAlt = new Registry({
                        hive: Registry.HKLM,
                        key: '\\SOFTWARE\\Valve\\Steam'
                    });

                    regKeyAlt.get('InstallPath', (err2, item2) => {
                        if (err2) {
                            reject(new Error('Could not find Steam installation in registry'));
                        } else {
                            resolve(item2.value);
                        }
                    });
                } else {
                    resolve(item.value);
                }
            });
        } else if (process.platform === 'darwin') {
            // macOS default path
            const macPath = path.join(process.env.HOME, 'Library/Application Support/Steam');
            if (fs.existsSync(macPath)) {
                resolve(macPath);
            } else {
                reject(new Error('Could not find Steam installation on macOS'));
            }
        } else if (process.platform === 'linux') {
            // Linux default path
            const linuxPath = path.join(process.env.HOME, '.steam/steam');
            if (fs.existsSync(linuxPath)) {
                resolve(linuxPath);
            } else {
                // Try alternative Linux path
                const altLinuxPath = path.join(process.env.HOME, '.local/share/Steam');
                if (fs.existsSync(altLinuxPath)) {
                    resolve(altLinuxPath);
                } else {
                    reject(new Error('Could not find Steam installation on Linux'));
                }
            }
        } else {
            reject(new Error('Unsupported operating system'));
        }
    });
}

// Function to get Steam accounts
async function getSteamAccounts(steamPath) {
    try {
        console.log('Looking for Steam accounts in:', steamPath);
        
        // Path to loginusers.vdf
        const loginUsersPath = path.join(steamPath, 'config', 'loginusers.vdf');
        
        // Check if the file exists
        if (!fs.existsSync(loginUsersPath)) {
            throw new Error('loginusers.vdf file not found');
        }
        
        // Read and parse the VDF file
        const data = fs.readFileSync(loginUsersPath, 'utf8');
        const parsed = vdf.parse(data);
        
        // Extract accounts
        const accounts = [];
        if (parsed && parsed.users) {
            for (const steamId in parsed.users) {
                const account = parsed.users[steamId];
                account.steamId = steamId;
                account.steamPath = steamPath; // Add Steam path to the account data
                
                // Try to get avatar URL if available
                account.avatarUrl = await getAvatarUrl(steamId, steamPath, account);
                
                // Get number of games and other account stats if available
                try {
                    const accountStats = await getAccountStats(steamId, steamPath);
                    Object.assign(account, accountStats);
                } catch (statsError) {
                    console.warn(`Could not get stats for account ${steamId}:`, statsError);
                }
                
                accounts.push(account);
            }
        }
        
        // Store accounts and Steam path in settings
        store.set('accounts', accounts);
        store.set('steamPath', steamPath);
        
        console.log(`Found ${accounts.length} Steam accounts`);
        return accounts;
    } catch (error) {
        console.error('Error getting Steam accounts:', error);
        throw error;
    }
}

// Function to get avatar URL for a Steam account
async function getAvatarUrl(steamId, steamPath, account) {
    try {
        // First, check in the Steam's main avatarcache - this is most reliable for current avatars
        const globalAvatarPath = path.join(steamPath, 'config', 'avatarcache');
        if (fs.existsSync(globalAvatarPath)) {
            // Look for avatar files that match this steam ID
            const steamIdShort = steamId.substring(steamId.length - 8); // Last 8 chars of steam ID
            
            const files = fs.readdirSync(globalAvatarPath)
                .filter(file => {
                    // Look for files with the steam ID in the name
                    return (file.includes(steamId) || file.includes(steamIdShort)) && 
                           (file.endsWith('.png') || file.endsWith('.jpg'));
                });
            
            if (files.length > 0) {
                // Get the most recent avatar file
                const avatarFiles = files
                    .map(file => {
                        const fullPath = path.join(globalAvatarPath, file);
                        return {
                            file,
                            fullPath,
                            mtime: fs.statSync(fullPath).mtime
                        };
                    })
                    .sort((a, b) => b.mtime - a.mtime);
                
                if (avatarFiles.length > 0) {
                    // Try to read the file to ensure it's accessible
                    try {
                        await fs.promises.access(avatarFiles[0].fullPath, fs.constants.R_OK);
                        console.log(`Found avatar for ${account.PersonaName}: ${avatarFiles[0].fullPath}`);
                        return `file://${avatarFiles[0].fullPath}`;
                    } catch (err) {
                        console.log(`Avatar file not accessible for ${account.PersonaName}, using Steam CDN fallback`);
                        return 'https://avatars.steamstatic.com/b5bd56c1aa4644a474a2e4972be27ef9e82e517e_full.jpg';
                    }
                }
            }
        }
        
        // If we get here, no valid avatar was found in the cache
        console.log(`No avatar found for ${account.PersonaName}, using Steam CDN fallback`);
        return 'https://avatars.steamstatic.com/b5bd56c1aa4644a474a2e4972be27ef9e82e517e_full.jpg';
    } catch (error) {
        console.error('Error getting avatar URL:', error);
        // Return Steam CDN URL as fallback
        return 'https://avatars.steamstatic.com/b5bd56c1aa4644a474a2e4972be27ef9e82e517e_full.jpg';
    }
}

// Function to get account stats
async function getAccountStats(steamId, steamPath) {
    try {
        const stats = {
            gameCount: 0,
            friendCount: 0,
            playtimeTotal: 0
        };
        
        // Try to get game count from libraryfolders.vdf
        const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
        if (fs.existsSync(libraryFoldersPath)) {
            const data = fs.readFileSync(libraryFoldersPath, 'utf8');
            const parsed = vdf.parse(data);
            
            // Count apps
            if (parsed && parsed.LibraryFolders) {
                // New format (Steam library 2.0)
                for (const folderIndex in parsed.LibraryFolders) {
                    if (folderIndex === 'TimeNextStatsReport' || folderIndex === 'ContentStatsID') continue;
                    
                    const folder = parsed.LibraryFolders[folderIndex];
                    if (folder && folder.apps) {
                        stats.gameCount += Object.keys(folder.apps).length;
                    }
                }
            }
        }
        
        // Try to get playtime from localconfig.vdf
        const userDataPath = path.join(steamPath, 'userdata', steamId.toString());
        if (fs.existsSync(userDataPath)) {
            const configPath = path.join(userDataPath, 'config', 'localconfig.vdf');
            if (fs.existsSync(configPath)) {
                const data = fs.readFileSync(configPath, 'utf8');
                const parsed = vdf.parse(data);
                
                if (parsed && parsed.UserLocalConfigStore && 
                    parsed.UserLocalConfigStore.Software && 
                    parsed.UserLocalConfigStore.Software.Valve && 
                    parsed.UserLocalConfigStore.Software.Valve.Steam && 
                    parsed.UserLocalConfigStore.Software.Valve.Steam.apps) {
                    
                    const apps = parsed.UserLocalConfigStore.Software.Valve.Steam.apps;
                    
                    // Count playtime across all apps
                    for (const appId in apps) {
                        const app = apps[appId];
                        if (app && app.playtime_forever) {
                            stats.playtimeTotal += parseInt(app.playtime_forever, 10) || 0;
                        }
                    }
                }
                
                // Try to get friend count from friends.vdf
                const friendsPath = path.join(userDataPath, 'config', 'friends.vdf');
                if (fs.existsSync(friendsPath)) {
                    const friendsData = fs.readFileSync(friendsPath, 'utf8');
                    const friendsParsed = vdf.parse(friendsData);
                    
                    if (friendsParsed && friendsParsed.Friends) {
                        stats.friendCount = Object.keys(friendsParsed.Friends).length;
                    }
                }
            }
        }
        
        return stats;
    } catch (error) {
        console.error('Error getting account stats:', error);
        return { gameCount: 0, friendCount: 0, playtimeTotal: 0 };
    }
}

// Function to get account games
async function getAccountGames(steamId, steamPath) {
    try {
        const games = [];
        
        // Get games from localconfig.vdf
        const userDataPath = path.join(steamPath, 'userdata', steamId.toString());
        if (fs.existsSync(userDataPath)) {
            const configPath = path.join(userDataPath, 'config', 'localconfig.vdf');
            if (fs.existsSync(configPath)) {
                const data = fs.readFileSync(configPath, 'utf8');
                const parsed = vdf.parse(data);
                
                if (parsed && parsed.UserLocalConfigStore && 
                    parsed.UserLocalConfigStore.Software && 
                    parsed.UserLocalConfigStore.Software.Valve && 
                    parsed.UserLocalConfigStore.Software.Valve.Steam && 
                    parsed.UserLocalConfigStore.Software.Valve.Steam.apps) {
                    
                    const apps = parsed.UserLocalConfigStore.Software.Valve.Steam.apps;
                    
                    // Get basic game info
                    for (const appId in apps) {
                        const app = apps[appId];
                        if (app) {
                            games.push({
                                appId,
                                name: `Game ${appId}`,  // Placeholder, we'll get real names later
                                playtimeForever: parseInt(app.playtime_forever, 10) || 0,
                                playtimeRecent: parseInt(app.playtime_2weeks, 10) || 0,
                                lastPlayed: parseInt(app.LastPlayed, 10) || 0,
                                installed: fs.existsSync(path.join(steamPath, 'steamapps', `appmanifest_${appId}.acf`))
                            });
                        }
                    }
                }
            }
        }
        
        // Try to get game names from appinfo.vdf
        try {
            const appInfoPath = path.join(steamPath, 'appcache', 'appinfo.vdf');
            if (fs.existsSync(appInfoPath)) {
                // Note: appinfo.vdf is a binary file, we can't easily parse it
                // For a full implementation, we'd need a binary VDF parser
                // For now, we'll just use placeholder names
            }
        } catch (appInfoError) {
            console.warn('Could not parse app info:', appInfoError);
        }
        
        return games;
    } catch (error) {
        console.error('Error getting account games:', error);
        throw error;
    }
}

// IPC handlers for settings
ipcMain.on('get-settings', (event) => {
    event.reply('settings-values', store.store);
});

ipcMain.on('get-setting', (event, key) => {
    event.reply('setting-value', store.get(key));
});

ipcMain.on('update-setting', (event, { key, value }) => {
    store.set(key, value);
    
    // Handle special settings
    if (key === 'startWithWindows') {
        if (value) {
            autoLauncher.enable();
        } else {
            autoLauncher.disable();
        }
    }
    
    // Notify all windows about the settings update
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('settings-updated', store.store);
    });
});

// Function to launch Steam
function launchSteam(steamPath) {
    return new Promise((resolve, reject) => {
        // On Windows, use 'start' command to launch Steam properly
        if (process.platform === 'win32') {
            const steamExePath = `"${path.join(steamPath, 'Steam.exe')}"`;
            // Use 'start' command with /D to set working directory
            exec(`start "" /D "${steamPath}" ${steamExePath}`, (err) => {
                if (err) {
                    console.error('Error launching Steam:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        } else {
            // For other platforms
            exec(`"${path.join(steamPath, 'steam')}"`, (err) => {
                if (err) {
                    console.error('Error launching Steam:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        }
    });
}

// Create tray instance
function createTray() {
    try {
        // Use Electron.ico from static/images
        const iconPath = path.join(__dirname, '../../static/images/Electron.ico');
        const icon = nativeImage.createFromPath(iconPath);
        
        // Create tray with icon
        tray = new Tray(icon);
        tray.setToolTip('Steam Manager');

        // Handle left click
        tray.on('click', () => {
            if (mainWindow) {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        });

        // Update tray context menu
        async function updateTrayMenu() {
            const steamPath = store.get('steamPath');
            const accounts = store.get('accounts', []);
            const isSteamRunning = await checkSteamRunning();
            
            const accountsSubmenu = accounts.map(account => ({
                label: account.PersonaName || account.AccountName,
                icon: account.avatarUrl ? nativeImage.createFromPath(account.avatarUrl.replace('file://', '')).resize({ width: 16, height: 16 }) : null,
                click: () => {
                    if (mainWindow) {
                        mainWindow.webContents.send('switch-account', account.steamId);
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            }));

            const contextMenu = Menu.buildFromTemplate([
                {
                    label: mainWindow && !mainWindow.isVisible() ? 'Show Manager' : 'Hide Manager',
                    click: () => {
                        if (mainWindow) {
                            if (mainWindow.isVisible()) {
                                mainWindow.hide();
                            } else {
                                mainWindow.show();
                                mainWindow.focus();
                            }
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Switch Account',
                    submenu: accountsSubmenu.length > 0 ? accountsSubmenu : [{ label: 'No accounts found', enabled: false }]
                },
                { type: 'separator' },
                {
                    label: isSteamRunning ? 'Close Steam' : 'Open Steam',
                    enabled: isSteamRunning || steamPath !== undefined,
                    click: async () => {
                        if (isSteamRunning) {
                            exec('taskkill /F /IM steam.exe', (err) => {
                                if (err) console.error('Error closing Steam:', err);
                                updateTrayMenu(); // Update menu after action
                            });
                        } else if (steamPath) {
                            try {
                                await launchSteam(steamPath);
                                updateTrayMenu(); // Update menu after action
                            } catch (err) {
                                console.error('Error launching Steam:', err);
                            }
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    click: () => {
                        app.isQuitting = true;
                        app.quit();
                    }
                }
            ]);

            tray.setContextMenu(contextMenu);
        }

        // Initial menu update
        updateTrayMenu();

        // Update menu when accounts change
        ipcMain.on('accounts-updated', updateTrayMenu);

        // Update menu when window visibility changes
        if (mainWindow) {
            mainWindow.on('show', updateTrayMenu);
            mainWindow.on('hide', updateTrayMenu);
        }

        // Update menu periodically to refresh Steam status
        setInterval(updateTrayMenu, 10000);

        return tray;
    } catch (error) {
        console.error('Error creating tray:', error);
        return null;
    }
}

// Check if Steam is running
function checkSteamRunning() {
    return new Promise((resolve) => {
        exec('tasklist /FI "IMAGENAME eq steam.exe"', (err, stdout) => {
            resolve(stdout.toLowerCase().includes('steam.exe'));
        });
    });
} 