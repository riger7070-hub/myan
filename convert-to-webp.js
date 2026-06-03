const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const imagesToConvert = [
  'icon-pwa-192-192.png',
  'icon-pwa-512-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'icon-og-512-512.png',
  'icon-favicon-16-16.png',
  'icon-favicon-32-32.png',
  'apple-touch-icon.png'
];

async function convertToWebP() {
  console.log('🎨 Starting WebP conversion...\n');

  for (const imagePath of imagesToConvert) {
    const fullPath = path.join(__dirname, imagePath);

    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  Skipped: ${imagePath} (not found)`);
      continue;
    }

    const outputPath = fullPath.replace(/\.(png|jpg|jpeg)$/i, '.webp');

    try {
      const info = await sharp(fullPath)
        .webp({ quality: 85 })
        .toFile(outputPath);

      const originalSize = fs.statSync(fullPath).size;
      const newSize = info.size;
      const savings = ((originalSize - newSize) / originalSize * 100).toFixed(1);

      console.log(`✅ ${imagePath}`);
      console.log(`   ${(originalSize / 1024).toFixed(1)}KB → ${(newSize / 1024).toFixed(1)}KB (${savings}% 절약)\n`);
    } catch (error) {
      console.error(`❌ Failed: ${imagePath}`, error.message);
    }
  }

  console.log('✨ WebP conversion complete!');
}

convertToWebP().catch(console.error);
