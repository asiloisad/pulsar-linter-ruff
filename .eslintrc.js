module.exports = {
  root: true,
  extends: "eslint:recommended",
  env: { es2022: true, browser: true, node: true },
  globals: { atom: "readonly" },
  parserOptions: { ecmaVersion: 2022, sourceType: "commonjs" },
  rules: {
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-constant-condition": ["error", { checkLoops: false }],
  },
};
