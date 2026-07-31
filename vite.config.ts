import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import dts from 'vite-plugin-dts'

const r = (p: string) => resolve(__dirname, p)

/**
 * Online-demo tweaks to the shared demo HTML.
 *
 * They live here rather than in `demo/index.html` so the local playground —
 * which is a three-page harness for exercising every adapter — is untouched.
 */
function onlineDemoHtml(): Plugin {
  return {
    name: 'sweet-album:online-demo-html',
    transformIndexHtml: (html) =>
      html
        .replace('<title>sweet-album · vanilla</title>', '<title>sweet-album · demo</title>')
        // The playground's running commentary is for whoever is developing the
        // library, not for someone here to look at photos. Hidden rather than
        // deleted: the demo script asserts the element exists and writes to it.
        // Styles inline because `demo/` is not in version control, so anything
        // this transform depends on has to travel with it.
        .replace('</head>', '  <style>#status { display: none }</style>\n  </head>')
        // The page switcher has nothing to switch to now, and which adapter
        // rendered this is not something a visitor can see or act on.
        .replace(
          /\s*<a href="\/index\.html"[^>]*>Vanilla<\/a>\s*<a href="\/react\.html">React<\/a>\s*<a href="\/vue\.html">Vue<\/a>/,
          '\n      <a href="https://github.com/leuvi/sweet-album" target="_blank" rel="noreferrer">GitHub</a>',
        ),
  }
}

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
  //
  // Only the one page ships. All three adapters render the identical DOM, so
  // React and Vue pages would look no different while dragging their runtimes
  // — together several times the weight of the album itself — onto a visitor
  // who cannot see what they bought. The local playground still builds all
  // three; that is where the adapters get exercised.
  if (mode === 'demo') {
    return {
      root: r('demo'),
      base: './',
      resolve: { alias: demoAlias },
      define: vueFlags,
      publicDir: false,
      plugins: [onlineDemoHtml()],
      build: {
        target: 'es2020',
        outDir: r('demo-online'),
        emptyOutDir: true,
        rollupOptions: { input: { index: r('demo/index.html') } },
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
