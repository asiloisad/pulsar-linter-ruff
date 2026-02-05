module.exports = {
  root: true,
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  globals: {
    atom: "readonly",
    requestAnimationFrame: "readonly",
  },
  rules: {
    "no-cond-assign": "off",
    "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^etch$" }],
  },
};
