import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'dist-ui/**', 'node_modules/**', '*.config.js', '*.config.ts'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        HTMLElement: 'readonly',
        console: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
];
