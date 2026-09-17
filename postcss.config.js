module.exports = {
  plugins: {
    // Must run before Tailwind: it inlines the partials in src/app/styles so
    // Tailwind sees one document and can hoist their @layer blocks.
    "postcss-import": {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
