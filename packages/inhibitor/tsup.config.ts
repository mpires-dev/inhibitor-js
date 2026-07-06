import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { resolve: true },
  clean: true,
  minify: true,
  noExternal: ['@inhibitor/core', '@inhibitor/browser', '@inhibitor/transport'],
});
