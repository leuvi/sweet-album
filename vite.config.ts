import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const r = (p: string) => resolve(__dirname, p)

export default defineConfig(({ command }) => {
  // `vite` (dev server) serves the local demo playground.
  if (command === 'serve') {
    return {
      root: r('demo'),
      resolve: {
        // Longest specifier first — Vite matches these in order.
        alias: [
          { find: 'sweet-album/style.css', replacement: r('src/styles/sweet-album.css') },
          { find: 'sweet-album/react', replacement: r('src/react/index.tsx') },
          { find: 'sweet-album/vue', replacement: r('src/vue/index.ts') },
          { find: 'sweet-album', replacement: r('src/core/index.ts') },
        ],
      },
      // Vue's bundler build expects these feature flags to be defined.
      define: {
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      },
      server: { port: 5273, open: '/index.html' },
    }
  }

  // `vite build` produces the publishable library.
  return {
    plugins: [
      // Declarations mirror the src tree (dist/core, dist/react, dist/vue) and
      // `exports` in package.json points at them — renaming the entry files
      // would break their relative imports.
      dts({
        include: ['src'],
        outDir: 'dist',
        entryRoot: 'src',
        insertTypesEntry: false,
        copyDtsFiles: false,
      }),
    ],
    build: {
      target: 'es2020',
      sourcemap: true,
      lib: {
        entry: {
          index: r('src/core/index.ts'),
          react: r('src/react/index.tsx'),
          vue: r('src/vue/index.ts'),
        },
        formats: ['es', 'cjs'],
      },
      rollupOptions: {
        external: ['react', 'react-dom', 'react/jsx-runtime', 'vue'],
        output: [
          {
            format: 'es',
            entryFileNames: '[name].js',
            chunkFileNames: 'chunks/[name]-[hash].js',
          },
          {
            format: 'cjs',
            entryFileNames: '[name].cjs',
            chunkFileNames: 'chunks/[name]-[hash].cjs',
            exports: 'named',
          },
        ],
      },
    },
  }
})
