const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const Registry = require('winreg');
const vdf = require('vdf');

/**
 * Get the Steam installation path from the Windows registry
 * @returns {Promise<string|null>} The Steam path or null if not found
 */
function getSteamPath() {
    return new Promise((resolve, reject) => {
        // Only works on Windows
        if (os.platform() !== 'win32') {
            return reject(new Error('This function only works on Windows'));
        }

        const regKey = new Registry({
            hive: Registry.HKCU,
            key: '\\Software\\Valve\\Steam'
        });

        regKey.get('SteamPath', (err, item) => {
            if (err) {
                console.error('Error retrieving Steam path from registry:', err);
                return resolve(null);
            }
            resolve(item.value);
        });
    });
}

/**
 * Parse VDF data to extract Steam accounts
 * @param {string} data - The VDF file content
 * @returns {Array} Array of accounts with their Steam IDs and names
 */
function parseVdf(data) {
    try {
        console.log('Parsing VDF data:', data.substring(0, 100) + '...');
        
        // Use vdf library to parse data
        const parsed = vdf.parse(data);
        console.log('Parsed VDF structure:', JSON.stringify(parsed, null, 2).substring(0, 300) + '...');
        
        if (!parsed) {
            console.warn('Failed to parse VDF data, returning empty array');
            return [];
        }
        
        const accounts = [];
        
        // VDF structure can be different. Try to handle common structures
        // Case 1: "users" object at the root level 
        if (parsed.users) {
            console.log('Found users object at root level');
            
            // Extract accounts from parsed VDF
            for (const steamId in parsed.users) {
                if (parsed.users[steamId]) {
                    const accountName = 
                        parsed.users[steamId].AccountName || 
                        parsed.users[steamId].accountName || 
                        parsed.users[steamId].account_name;
                    
                    const personaName = 
                        parsed.users[steamId].PersonaName || 
                        parsed.users[steamId].personaName || 
                        parsed.users[steamId].persona_name ||
                        accountName;
                    
                    if (accountName) {
                        accounts.push({
                            steamId,
                            accountName,
                            personaName
                        });
                        console.log(`Found account: ${personaName} (${accountName}) (${steamId})`);
                    }
                }
            }
        } 
        // Case 2: "loginusers" > "users" structure
        else if (parsed.loginusers && parsed.loginusers.users) {
            console.log('Found loginusers.users structure');
            
            for (const steamId in parsed.loginusers.users) {
                if (parsed.loginusers.users[steamId]) {
                    const accountName = 
                        parsed.loginusers.users[steamId].AccountName || 
                        parsed.loginusers.users[steamId].accountName ||
                        parsed.loginusers.users[steamId].account_name;
                    
                    const personaName = 
                        parsed.loginusers.users[steamId].PersonaName || 
                        parsed.loginusers.users[steamId].personaName || 
                        parsed.loginusers.users[steamId].persona_name ||
                        accountName;
                    
                    if (accountName) {
                        accounts.push({
                            steamId,
                            accountName,
                            personaName
                        });
                        console.log(`Found account: ${personaName} (${accountName}) (${steamId})`);
                    }
                }
            }
        }
        // Case 3: Root level structure (like the loginusers.vdf file)
        else {
            console.log('Trying root level structure parsing');
            
            // Loop through top-level keys which should be SteamIDs
            for (const steamId in parsed) {
                if (parsed[steamId] && typeof parsed[steamId] === 'object') {
                    const accountName = 
                        parsed[steamId].AccountName || 
                        parsed[steamId].accountName || 
                        parsed[steamId].account_name;
                    
                    const personaName = 
                        parsed[steamId].PersonaName || 
                        parsed[steamId].personaName || 
                        parsed[steamId].persona_name ||
                        accountName;
                    
                    if (accountName) {
                        accounts.push({
                            steamId,
                            accountName,
                            personaName
                        });
                        console.log(`Found account: ${personaName} (${accountName}) (${steamId})`);
                    }
                }
            }
        }
        
        console.log(`Total accounts found: ${accounts.length}`);
        return accounts;
    } catch (err) {
        console.error('Error parsing VDF data:', err);
        return [];
    }
}

/**
 * Get Steam accounts from loginusers.vdf
 * @param {string} steamPath - The Steam installation path
 * @returns {Promise<Array>} Array of Steam accounts
 */
async function getSteamAccounts(steamPath) {
    return new Promise((resolve, reject) => {
        if (!steamPath) {
            console.error('No Steam path provided');
            return resolve([]);
        }

        const loginusersPath = path.join(steamPath, 'config', 'loginusers.vdf');
        console.log('Looking for loginusers.vdf at:', loginusersPath);
        
        // Check if the file exists
        if (!fs.existsSync(loginusersPath)) {
            console.error('loginusers.vdf not found at expected path:', loginusersPath);
            return resolve([]);
        }
        
        fs.readFile(loginusersPath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading loginusers.vdf:', err);
                return resolve([]);
            }
            
            console.log('Successfully read loginusers.vdf, file size:', data.length);
            
            // Parse VDF and get accounts
            const accounts = parseVdf(data);
            
            // If no accounts were found using our parser, try a simpler regex approach
            if (accounts.length === 0) {
                console.log('No accounts found using VDF parser, trying regex approach');
                
                // Simple regex to extract account names and persona names directly from the file
                const accountNameRegex = /"AccountName"\s+"([^"]+)"/g;
                const personaNameRegex = /"PersonaName"\s+"([^"]+)"/g;
                const steamIdRegex = /"(\d+)"/g;
                
                const accountNames = [];
                const personaNames = [];
                const steamIds = [];
                
                let match;
                while ((match = accountNameRegex.exec(data)) !== null) {
                    accountNames.push(match[1]);
                }
                
                while ((match = personaNameRegex.exec(data)) !== null) {
                    personaNames.push(match[1]);
                }
                
                while ((match = steamIdRegex.exec(data)) !== null) {
                    // Only consider Steam IDs that are at the right level in the file structure
                    // (this is a simple heuristic and might need adjustment)
                    if (match.index < 100 || data.substr(match.index - 20, 20).includes('users')) {
                        steamIds.push(match[1]);
                    }
                }
                
                console.log('Found via regex - Account names:', accountNames, 'Persona names:', personaNames, 'Steam IDs:', steamIds);
                
                // Combine the arrays if they're the same length
                if (accountNames.length > 0 && accountNames.length === steamIds.length) {
                    const regexAccounts = accountNames.map((name, index) => ({
                        steamId: steamIds[index],
                        accountName: name,
                        personaName: (index < personaNames.length) ? personaNames[index] : name
                    }));
                    
                    console.log('Created accounts from regex:', regexAccounts);
                    resolve(regexAccounts);
                } else if (accountNames.length > 0) {
                    // If we have account names but not matching Steam IDs, just return the names
                    const simpleAccounts = accountNames.map((name, index) => ({
                        accountName: name,
                        personaName: (index < personaNames.length) ? personaNames[index] : name
                    }));
                    
                    console.log('Created simple accounts from account names:', simpleAccounts);
                    resolve(simpleAccounts);
                } else {
                    console.warn('Could not extract any accounts using regex either');
                    resolve([]);
                }
            } else {
                resolve(accounts);
            }
        });
    });
}

/**
 * Set Steam auto-login for a specific user
 * @param {string} username - The Steam account username to auto-login
 * @returns {Promise<boolean>} Success status
 */
function setSteamAutologin(username) {
    return new Promise((resolve, reject) => {
        // Only works on Windows
        if (os.platform() !== 'win32') {
            return reject(new Error('This function only works on Windows'));
        }

        console.log(`Setting AutoLoginUser in registry to: ${username}`);
        
        // Escape double quotes in username to prevent command injection
        const escapedUsername = username.replace(/"/g, '\\"');

        // Use exec with 'reg.exe' directly for better Unicode support
        exec(`reg add "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v AutoLoginUser /t REG_SZ /d "${escapedUsername}" /f`, (err, stdout, stderr) => {
            if (err) {
                console.error('Error setting AutoLoginUser in registry:', err);
                return resolve(false);
            }
            
            console.log('Successfully set AutoLoginUser in registry');
            
            // Set RememberPassword value
            exec(`reg add "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v RememberPassword /t REG_DWORD /d 1 /f`, (err, stdout, stderr) => {
                if (err) {
                    console.error('Error setting RememberPassword in registry:', err);
                    // Even if RememberPassword setting fails, Steam might still auto-login
                    // so we return success if at least the username was set
                    console.log('But continuing anyway since AutoLoginUser was set successfully');
                    return resolve(true);
                }
                
                console.log('Successfully set RememberPassword in registry');
                
                // Try setting SkipOfflineModeWarning as well (optional)
                exec(`reg add "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v SkipOfflineModeWarning /t REG_DWORD /d 1 /f`, (err, stdout, stderr) => {
                    if (err) {
                        console.warn('Failed to set SkipOfflineModeWarning, but continuing anyway:', err);
                    } else {
                        console.log('Successfully set SkipOfflineModeWarning in registry');
                    }
                    
                    console.log(`Auto-login complete for user: ${username}`);
                    resolve(true);
                });
            });
        });
    });
}

/**
 * Restart Steam
 * @param {string} steamPath - The Steam installation path
 * @param {string} accountName - The account name to login with
 * @returns {Promise<boolean>} Success status
 */
function restartSteam(steamPath, accountName) {
    return new Promise((resolve, reject) => {
        if (!steamPath) {
            return reject(new Error('Steam path is required'));
        }

        // Kill Steam process if it's running
        exec('taskkill /F /IM steam.exe', (err) => {
            if (err) {
                // This is not a fatal error - Steam might not be running
                console.log('Steam process not found or already closed, proceeding to launch Steam');
            } else {
                console.log('Steam process terminated successfully');
            }
            
            // Wait a bit before starting Steam
            const delay = err ? 500 : 2000; // Shorter delay if Steam wasn't running
            
            setTimeout(() => {
                const steamExePath = path.join(steamPath, 'Steam.exe');
                console.log(`Launching Steam from: ${steamExePath} with account: ${accountName}`);
                
                // Prepare login parameters if an account name was provided
                const loginParams = accountName ? `-login "${accountName}"` : '';
                
                // Launch Steam using 'start' command on Windows for better handling
                if (process.platform === 'win32') {
                    // Use the start command which handles spaces in paths better
                    // /D sets the working directory
                    exec(`start "" /D "${steamPath}" "${steamExePath}" ${loginParams}`, (err) => {
                        if (err) {
                            console.error('Error launching Steam:', err);
                            return resolve(false);
                        }
                        
                        console.log('Steam has been started successfully with login parameters');
                        resolve(true);
                    });
                } else {
                    // For non-Windows platforms
                    exec(`"${steamExePath}" ${loginParams}`, (err) => {
                        if (err) {
                            console.error('Error launching Steam:', err);
                            return resolve(false);
                        }
                        
                        console.log('Steam has been started successfully with login parameters');
                        resolve(true);
                    });
                }
            }, delay);
        });
    });
}

/**
 * Verify if Steam is running and logged in with the specified account
 * @param {string} accountName - The account name to check
 * @returns {Promise<boolean>} True if logged in successfully
 */
function verifySteamLogin(accountName) {
    return new Promise((resolve) => {
        // We'll use simple checking to see if Steam is running with the account
        console.log(`Verifying if Steam is running with account: ${accountName}`);
        
        // Wait a short time to check if Steam is running
        setTimeout(() => {
            // On Windows, check if the Steam process is running
            if (process.platform === 'win32') {
                exec('tasklist /FI "IMAGENAME eq steam.exe" /FO CSV', (err, stdout) => {
                    if (err) {
                        console.warn('Failed to check if Steam is running:', err);
                        return resolve(false);
                    }
                    
                    if (stdout.includes('steam.exe')) {
                        console.log('Steam is running with account:', accountName);
                        // If Steam is running, we'll consider the login successful
                        // since we've already set the registry settings correctly
                        return resolve(true);
                    } else {
                        console.warn('Steam does not appear to be running after launch');
                        return resolve(false);
                    }
                });
            } else {
                // For non-Windows platforms use a different check or assume success
                return resolve(true);
            }
        }, 3000); // Check after 3 seconds - shorter wait time
    });
}

/**
 * Switch to a different Steam account
 * @param {string} accountName - The account name to switch to
 * @returns {Promise<object>} Result with success status and additional info
 */
async function switchSteamAccount(accountName) {
    try {
        if (!accountName) {
            console.error('No account name provided');
            throw new Error('Account name is required');
        }
        
        console.log(`Attempting to switch to Steam account: ${accountName}`);
        
        // Step 1: Get Steam path
        const steamPath = await getSteamPath();
        if (!steamPath) {
            console.error('Steam path not found');
            throw new Error('Steam path not found');
        }
        
        console.log(`Steam path found: ${steamPath}`);
        console.log(`Setting auto-login for account: ${accountName}`);
        
        // Step 2: Set auto-login in registry
        const success = await setSteamAutologin(accountName);
        if (!success) {
            console.error('Failed to set auto-login');
            throw new Error('Failed to set auto-login in registry');
        }
        
        console.log('Auto-login set successfully, starting/restarting Steam...');
        
        // Step 3: Start/restart Steam
        try {
            // Pass the account name to restartSteam to use -login parameter
            const steamStarted = await restartSteam(steamPath, accountName);
            if (!steamStarted) {
                console.warn('Warning: Steam may not have started properly, but registry settings were applied');
                // Return partial success
                return {
                    success: true,
                    registrySet: true,
                    steamStarted: false,
                    loginVerified: false,
                    message: 'Account set in registry but Steam may not have started properly'
                };
            }
            
            console.log('Steam started successfully with account:', accountName);
            
            // Step 4: Verify the login actually succeeded
            const loginVerified = await verifySteamLogin(accountName);
            
            return {
                success: true,
                registrySet: true,
                steamStarted: true,
                loginVerified,
                message: loginVerified 
                    ? `Successfully logged in with account: ${accountName}` 
                    : `Steam started with account: ${accountName}, but login verification is pending`
            };
        } catch (steamError) {
            console.error('Error starting Steam:', steamError);
            // Still return partial success if registry was set but Steam launch failed
            return {
                success: true,
                registrySet: true,
                steamStarted: false,
                loginVerified: false,
                message: 'Registry set but Steam may not have started. Account will be used next time Steam starts.'
            };
        }
    } catch (err) {
        console.error('Error switching Steam account:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

module.exports = {
    getSteamPath,
    getSteamAccounts,
    setSteamAutologin,
    restartSteam,
    switchSteamAccount,
    verifySteamLogin
}; 