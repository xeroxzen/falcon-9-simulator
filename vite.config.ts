import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { validateComponentContent } from './src/content/schema.js';

function validateComponentsPlugin(): Plugin {
  return {
    name: 'validate-component-content',
    buildStart() {
      const dir = path.resolve(process.cwd(), 'src/content/components');
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      const seen = new Set<string>();
      for (const file of files) {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const valid = validateComponentContent(raw, file);
        if (seen.has(valid.id)) {
          throw new Error(`Duplicate component id "${valid.id}" in ${file}`);
        }
        seen.add(valid.id);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), validateComponentsPlugin()],
  worker: {
    format: 'es',
  },
});
