import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

/**
 * 有正式站点地址时，补上 canonical、分享绝对地址和 sitemap。
 * @param mode Vite 当前模式，用来读取对应的 .env
 * @returns 只在设置了 VITE_SITE_URL 时改写 HTML 的插件
 */
/**
 * 站点地址可以是域名，也可以是已经带 /quick-type 的页面地址。
 * @param site VITE_SITE_URL
 * @returns 以斜杠结尾的页面地址
 */
function resolvePageUrl(site: string): string {
  const trimmed = site.replace(/\/$/, '');
  if (trimmed.endsWith('/quick-type')) return `${trimmed}/`;
  return `${trimmed}/quick-type/`;
}

function siteSeo(mode: string): Plugin {
  let site = '';
  let outDir = '';
  let command = 'serve';

  return {
    name: 'site-seo',
    configResolved(config) {
      const env = loadEnv(mode, config.root, 'VITE_');
      site = (env.VITE_SITE_URL || '').trim().replace(/\/$/, '');
      outDir = path.resolve(config.root, config.build.outDir);
      command = config.command;
    },
    transformIndexHtml(html) {
      if (!site) return html.replace('<!--site-seo-->', '');

      const page = resolvePageUrl(site);
      const image = `${page}og.png`;
      const tags = [
        `<link rel="canonical" href="${page}" />`,
        `<meta property="og:url" content="${page}" />`,
      ].join('\n    ');

      return html
        .replace('<!--site-seo-->', tags)
        .replaceAll('%BASE_URL%og.png', image)
        .replaceAll('/quick-type/og.png', image)
        .replace(
          '"applicationCategory": "DeveloperApplication"',
          `"url": ${JSON.stringify(page)},\n        "applicationCategory": "DeveloperApplication"`
        );
    },
    closeBundle() {
      if (command !== 'build' || !site) return;

      const page = resolvePageUrl(site);
      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `  <url><loc>${page.replace(/&/g, '&amp;')}</loc></url>`,
        '</urlset>',
        '',
      ].join('\n');

      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap);
      fs.writeFileSync(
        path.join(outDir, 'robots.txt'),
        `User-agent: *\nAllow: /\nSitemap: ${page}sitemap.xml\n`
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/quick-type/',
  plugins: [react(), siteSeo(mode)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}))
