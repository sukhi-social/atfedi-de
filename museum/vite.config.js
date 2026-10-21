import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      // v3 dropped the built-in $lib; keep the existing imports working
      alias: { $lib: 'src/lib' },
      // モノレポ共通のdistへ。dispatcher Workerが museum.atfedi.de → /museum で配る
      adapter: adapter({
        pages: '../dist/museum',
        assets: '../dist/museum',
      }),
      prerender: {
        // /section/fedify/#sig のようなハッシュは「地図のその場所を開く」
        // 独自の作法で、ページ内アンカーではないので、検札しない
        handleMissingId: 'ignore',
      },
    }),
  ],
});
