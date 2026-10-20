import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

const projectRoot = process.cwd();
const binDir = path.join(projectRoot, 'resources', 'bin');

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

console.log('Target directory:', binDir);

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (targetUrl) => {
      https.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return request(response.headers.location);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Download failed with status code ${response.statusCode}: ${url}`));
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    request(url);
  });
}

async function main() {
  console.log('Downloading latest geoip.dat and geosite.dat from Loyalsoldier release...');
  try {
    await downloadFile(
      'https://raw.githubusercontent.com/Loyalsoldier/v2ray-rules-dat/release/geoip.dat',
      path.join(binDir, 'geoip.dat')
    );
    console.log('✓ geoip.dat downloaded');
    await downloadFile(
      'https://raw.githubusercontent.com/Loyalsoldier/v2ray-rules-dat/release/geosite.dat',
      path.join(binDir, 'geosite.dat')
    );
    console.log('✓ geosite.dat downloaded');
  } catch (err) {
    console.warn('Note: Could not download geo dat files directly via network:', err.message);
  }

  console.log('\nTo obtain xray.exe:');
  console.log('Download Xray-windows-64.zip from https://github.com/XTLS/Xray-core/releases/latest');
  console.log(`Extract xray.exe, geoip.dat, and geosite.dat into: ${binDir}\n`);
}

main().catch(err => {
  console.error('Setup failed:', err);
});
