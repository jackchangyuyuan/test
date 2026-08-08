/** @type {import("lint-staged").Configuration} */
export default {
  "*.{js,ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{html,css,json,md,yaml}": "prettier --write",
};
