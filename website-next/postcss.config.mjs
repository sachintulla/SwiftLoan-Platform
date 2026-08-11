/**
 * Tailwind v4 ships its PostCSS integration as a separate package — the v3
 * `tailwindcss` plugin entry no longer exists, so referencing it here fails at
 * build with a misleading "module is not a PostCSS plugin" error.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
