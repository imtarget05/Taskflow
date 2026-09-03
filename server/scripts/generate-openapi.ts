import { writeFileSync } from 'fs';
import { buildOpenApiDocument } from '../src/lib/openapi';
import { stringify } from 'yaml';

const doc = buildOpenApiDocument();
writeFileSync('openapi.json', JSON.stringify(doc, null, 2));
writeFileSync('openapi.yaml', stringify(doc));
console.log('OpenAPI generated: openapi.json + openapi.yaml');
