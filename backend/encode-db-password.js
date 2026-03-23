'use strict';

const input = process.argv.slice(2).join(' ');

if (!input) {
    console.error('Usage: npm run encode-db-password -- "your-password-here"');
    process.exit(1);
}

console.log(encodeURIComponent(input));
