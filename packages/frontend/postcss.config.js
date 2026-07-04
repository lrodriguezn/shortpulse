/**
 * PostCSS config — TailwindCSS + autoprefixer.
 *
 * ESM-formatted (`export default`) because the package is
 * `type: "module"` in `package.json`. PostCSS loads configs via the
 * Node ESM loader; the `module.exports = …` form triggers the
 * "module is not defined in ES module scope" error from Vite.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
