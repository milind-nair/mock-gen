const fs = require('node:fs');
const path = require('node:path');

const filePath = path.resolve(__dirname, '..', 'dist', 'cli.js');
if (!fs.existsSync(filePath)) {
  console.error(`Expected build output not found: ${filePath}`);
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const shebang = '#!/usr/bin/env node\n';
if (!content.startsWith(shebang)) {
  fs.writeFileSync(filePath, shebang + content, 'utf8');
}
