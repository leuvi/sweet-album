import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const r = (p: string) => resolve(__dirname, p)

/** Source aliases so the demo compiles against src, not the published package. */
const demoAlias = [
  // Longest specifier first — Vite matches these in order.
  { find: 'sweet-album/style.css', replacement: r('src/styles/sweet-album.css') },
  { find: 'sweet-album/react', replacement: r('src/react/index.tsx') },
  { find: 'sweet-album/vue', replacement: r('src/vue/index.ts') },
  { find: 'sweet-album', replacement: r('src/core/index.ts') },
]

/** Vue's bundler build expects these feature flags to be defined. */
const vueFlags = {
  __VUE_OPTIONS_API__: 'true',
  __VUE_PROD_DEVTOOLS__: 'false',
  __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
}

export default defineConfig(({ command, mode }) => {
  // `vite` (dev server) serves the local demo playground.
  if (command === 'serve') {
    return {
      root: r('demo'),
      resolve: { alias: demoAlias },
      define: vueFlags,
      server: { port: 5273, open: '/index.html' },
    }
  }

  // `vite build --mode demo` produces the deployable online demo. Photos are
  // NOT bundled — they are served from a separate host, so `demo/photos` must
  // stay out of the output (hence publicDir: false).
  if (mode === 'demo') {
    return {
      root: r('demo'),
      base: './',
      resolve: { alias: demoAlias },
      define: vueFlags,
      publicDir: false,
      build: {
        target: 'es2020',
        outDir: r('demo-online'),
        emptyOutDir: true,
        rollupOptions: {
          input: {
            index: r('demo/index.html'),
            react: r('demo/react.html'),
            vue: r('demo/vue.html'),
          },
        },
      },
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
