import { parse } from 'yaml';
import { readFileSync } from 'fs';
parse(readFileSync('.github/workflows/e2e.yml', 'utf8'));
console.log('e2e workflow yaml valid');

