module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'react-app',
    'react-app/jest'
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true
    },
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: [
    'react'
  ],
  rules: {
    // Customize rules as needed
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // Allow console.log in this project
    'react/prop-types': 'off' // Disable prop-types requirement for now
  },
  overrides: [
    {
      files: ['**/__tests__/**/*', '**/*.test.js'],
      env: {
        jest: true
      }
    }
  ]
};