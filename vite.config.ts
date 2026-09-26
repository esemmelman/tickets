import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({ plugins: [react()], base: '/tickets/', cacheDir: join(tmpdir(), 'personal-tickets-vite-cache'), define: { __APP_VERSION__: JSON.stringify(pkg.version) } });
