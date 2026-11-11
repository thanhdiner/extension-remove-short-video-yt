import { build } from 'esbuild';
await build({ entryPoints: ['src/editor-detector.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/editor-detector.js' });
await build({ entryPoints: ['src/auth-worker.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/auth-worker.js' });
await build({ entryPoints: ['src/auth-qr.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/auth-qr.js' });
await build({ entryPoints: ['src/proxy-worker.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/proxy-worker.js' });
await build({ entryPoints: ['src/json-detector.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/json-detector.js' });
await build({ entryPoints: ['src/json-viewer-worker.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/json-viewer-worker.js' });
await build({ entryPoints: ['src/json-viewer.jsx'], bundle: true, minify: true, format: 'iife', outfile: 'dist/json-viewer.js', define: { 'process.env.NODE_ENV': '"production"' } });
await build({ entryPoints: ['src/popup.jsx'], bundle: true, minify: true, format: 'iife', outfile: 'dist/popup.js', define: { 'process.env.NODE_ENV': '"production"' } });

await build({ entryPoints: ['src/focus-popup.jsx'], bundle: true, minify: true, format: 'iife', outfile: 'dist/focus-popup.js', define: { 'process.env.NODE_ENV': '"production"' } });

await build({ entryPoints: ['src/options-selects.jsx'], bundle: true, minify: true, format: 'iife', outfile: 'dist/options-selects.js', define: { 'process.env.NODE_ENV': '"production"' } });

await build({ entryPoints: ['src/options-accordions.jsx'], bundle: true, minify: true, format: 'iife', outfile: 'dist/options-accordions.js', define: { 'process.env.NODE_ENV': '"production"' } });

await build({ entryPoints: ['src/options-topics.jsx'], bundle: true, minify: true, format: 'iife', outfile: 'dist/options-topics.js', define: { 'process.env.NODE_ENV': '"production"' } });

await build({ entryPoints: ['src/options-preset-help.jsx'], bundle: true, minify: true, format: 'iife', outfile: 'dist/options-preset-help.js', define: { 'process.env.NODE_ENV': '"production"' } });

await build({ entryPoints: ['src/language-runtime.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/language-runtime.js', define: { 'process.env.NODE_ENV': '"production"' } });

await build({ entryPoints: ['src/content-language.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/content-language.js', define: { 'process.env.NODE_ENV': '"production"' } });

await build({ entryPoints: ['src/worker-language.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/worker-language.js', define: { 'process.env.NODE_ENV': '"production"' } });
