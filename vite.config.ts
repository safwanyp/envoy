import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

/**
 * Static assets come from Vite's publicDir (`public/` by default).
 * @see https://developers.cloudflare.com/cf/projects/cloudflare-config/
 */
export default defineConfig({
  plugins: [cloudflare()],
  publicDir: 'public',
  server: {
    host: '127.0.0.1',
    port: 8791,
    strictPort: false,
  },
});
