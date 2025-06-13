const fs = require('fs');
const path = require('path');
const https = require('https');

// Copy the CSS to templates folder for direct access
function copyCSS() {
  const cssFile = path.join(__dirname, 'app', 'static', 'css', 'style.css');
  const targetFile = path.join(__dirname, 'app', 'templates', 'style.css');
  
  try {
    if (fs.existsSync(cssFile)) {
      const cssContent = fs.readFileSync(cssFile, 'utf8');
      fs.writeFileSync(targetFile, cssContent);
      console.log('CSS copied successfully to templates folder');
    } else {
      console.error('CSS file not found at:', cssFile);
    }
  } catch (err) {
    console.error('Error copying CSS:', err);
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

// Set up Font Awesome locally
async function setupFontAwesome() {
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

  // Download Font Awesome CSS for local use
  const fontAwesomeCssPath = path.join(fontAwesomePath, 'all.min.css');
  const cssExists = fs.existsSync(fontAwesomeCssPath);

  // Font Awesome webfont files to download
  const webfonts = [
    { name: 'fa-brands-400.woff2', type: 'brands' },
    { name: 'fa-solid-900.woff2', type: 'solid' },
    { name: 'fa-regular-400.woff2', type: 'regular' },
    { name: 'fa-v4compatibility.woff2', type: 'v4compatibility' }
  ];

  try {
    // Download CSS if it doesn't exist
    if (!cssExists) {
      console.log('Downloading Font Awesome CSS...');
      const fontAwesomeCdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
      
      await downloadFile(fontAwesomeCdnUrl, fontAwesomeCssPath);
      console.log('Font Awesome CSS downloaded successfully');
    }
    
    // Fix paths in CSS file
    let cssContent = fs.readFileSync(fontAwesomeCssPath, 'utf8');
    
    // Update paths in CSS to point to local webfonts folder
    if (cssContent.includes('//cdnjs.cloudflare.com')) {
      cssContent = cssContent.replace(/\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/6\.5\.1\/webfonts\//g, './webfonts/');
      fs.writeFileSync(fontAwesomeCssPath, cssContent);
      console.log('Font Awesome CSS paths updated for local use');
    }
    
    // Download webfonts
    for (const font of webfonts) {
      const fontPath = path.join(webfontsPath, font.name);
      if (!fs.existsSync(fontPath)) {
        console.log(`Downloading ${font.name}...`);
        const fontUrl = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/${font.name}`;
        
        await downloadFile(fontUrl, fontPath);
        console.log(`${font.name} downloaded successfully`);
      } else {
        console.log(`${font.name} already exists locally`);
      }
    }
    
    console.log('Font Awesome setup completed successfully');
  } catch (error) {
    console.error('Error setting up Font Awesome:', error);
  }
}

// Run the functions
copyCSS();
setupFontAwesome(); 