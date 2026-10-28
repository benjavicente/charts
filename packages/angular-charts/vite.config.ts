import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    angular({ tsconfig: resolve(import.meta.dirname, 'tsconfig.lib.json') }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        'tanstack-angular-charts': resolve(import.meta.dirname, 'src/index.ts'),
        'tanstack-angular-charts-canvas': resolve(
          import.meta.dirname,
          'src/canvas.ts',
        ),
        'tanstack-angular-charts-server': resolve(
          import.meta.dirname,
          'src/server.ts',
        ),
      },
      formats: ['es'],
    },
    rolldownOptions: {
      external: [/^@angular\//, /^@tanstack\/charts(?:\/|$)/, 'tslib'],
      output: {
        entryFileNames: 'fesm2022/[name].mjs',
        chunkFileNames: 'fesm2022/chunks/[name]-[hash].mjs',
      },
    },
  },
})
