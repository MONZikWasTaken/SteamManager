const fs = require('fs');
const path = require('path');
const https = require('https');

const sourcePath = path.join(__dirname, 'app', 'static', 'css', 'style.css');
const destPath = path.join(__dirname, 'app', 'templates', 'style.css');

// Copy local CSS file
try {
    // Read the source file
    const css = fs.readFileSync(sourcePath, 'utf8');
    
    // Write to destination
    fs.writeFileSync(destPath, css);
    
    console.log('CSS copied to templates folder for direct access');
    console.log('Source CSS exists:', fs.existsSync(sourcePath));
    console.log('Target CSS exists:', fs.existsSync(destPath));
    console.log('CSS file size:', fs.statSync(destPath).size, 'bytes');
} catch (error) {
    console.error('Error copying CSS file:', error);
}

// Create folders for Font Awesome if they don't exist
const fontAwesomePath = path.join(__dirname, 'app', 'templates', 'fontawesome');
const webfontsPath = path.join(fontAwesomePath, 'webfonts');

if (!fs.existsSync(fontAwesomePath)) {
    try {
        fs.mkdirSync(fontAwesomePath, { recursive: true });
        console.log('Created Font Awesome directory');
    } catch (error) {
        console.error('Error creating Font Awesome directory:', error);
    }
}

if (!fs.existsSync(webfontsPath)) {
    try {
        fs.mkdirSync(webfontsPath, { recursive: true });
        console.log('Created Font Awesome webfonts directory');
    } catch (error) {
        console.error('Error creating Font Awesome webfonts directory:', error);
    }
}

// Download a file from URL and save it to the specified path
function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            const fileStream = fs.createWriteStream(filePath);
            response.pipe(fileStream);
            
            fileStream.on('finish', () => {
                fileStream.close();
                resolve(filePath);
            });
            
            fileStream.on('error', (err) => {
                fs.unlink(filePath, () => {}); // Delete the file on error
                reject(err);
            });
        }).on('error', reject);
    });
}

// Download Font Awesome CSS for local use
const fontAwesomeCssPath = path.join(fontAwesomePath, 'all.min.css');
const cssDownloaded = !fs.existsSync(fontAwesomeCssPath);

// Font Awesome webfont files to download
const webfonts = [
    { name: 'fa-brands-400.woff2', type: 'brands' },
    { name: 'fa-solid-900.woff2', type: 'solid' },
    { name: 'fa-regular-400.woff2', type: 'regular' }
];

// Download CSS
if (cssDownloaded) {
    console.log('Downloading Font Awesome CSS...');
    const fontAwesomeCdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    
    downloadFile(fontAwesomeCdnUrl, fontAwesomeCssPath)
        .then(() => {
            console.log('Font Awesome CSS downloaded successfully');
            
            // After CSS is downloaded, we need to fix the CSS paths
            let cssContent = fs.readFileSync(fontAwesomeCssPath, 'utf8');
            
            // Update paths in CSS to point to local webfonts folder
            cssContent = cssContent.replace(/\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/6\.5\.1\/webfonts\//g, './webfonts/');
            
            // Write the modified CSS back
            fs.writeFileSync(fontAwesomeCssPath, cssContent);
            console.log('Font Awesome CSS paths updated for local use');
        })
        .catch(error => {
            console.error('Error downloading Font Awesome CSS:', error);
        });
} else {
    console.log('Font Awesome CSS already exists locally');
    
    // Update paths in existing CSS file
    try {
        let cssContent = fs.readFileSync(fontAwesomeCssPath, 'utf8');
        
        // Check if the paths need updating
        if (cssContent.includes('//cdnjs.cloudflare.com')) {
            // Update paths in CSS to point to local webfonts folder
            cssContent = cssContent.replace(/\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/6\.5\.1\/webfonts\//g, './webfonts/');
            
            // Write the modified CSS back
            fs.writeFileSync(fontAwesomeCssPath, cssContent);
            console.log('Existing Font Awesome CSS paths updated for local use');
        }
    } catch (error) {
        console.error('Error updating existing Font Awesome CSS paths:', error);
    }
}

// Download webfonts
webfonts.forEach(font => {
    const fontPath = path.join(webfontsPath, font.name);
    if (!fs.existsSync(fontPath)) {
        console.log(`Downloading ${font.name}...`);
        const fontUrl = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/${font.name}`;
        
        downloadFile(fontUrl, fontPath)
            .then(() => {
                console.log(`${font.name} downloaded successfully`);
            })
            .catch(error => {
                console.error(`Error downloading ${font.name}:`, error);
            });
    } else {
        console.log(`${font.name} already exists locally`);
    }
}); 