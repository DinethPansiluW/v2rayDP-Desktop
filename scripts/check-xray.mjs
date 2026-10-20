import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const requiredFiles = [
  path.join(projectRoot, 'resources', 'bin', 'xray.exe'),
  path.join(projectRoot, 'resources', 'bin', 'geoip.dat'),
  path.join(projectRoot, 'resources', 'bin', 'geosite.dat')
];

const missing = requiredFiles.filter(file => !fs.existsSync(file));

if (missing.length > 0) {
  console.error('\n======================================================');
  console.error(' [BUILD ERROR] Missing Xray-core distribution assets:');
  missing.forEach(file => console.error(`   - ${path.relative(projectRoot, file)}`));
  console.error('------------------------------------------------------');
  console.error(' Please ensure the following files exist before packaging:');
  console.error('   resources/bin/xray.exe');
  console.error('   resources/bin/geoip.dat');
  console.error('   resources/bin/geosite.dat');
  console.error('======================================================\n');
  process.exit(1);
}

console.log('✓ Verified: resources/bin contains xray.exe, geoip.dat, and geosite.dat.');
process.exit(0);
