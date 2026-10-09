import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/', 'dev-dist/', 'coverage/', 'test-results/', 'playwright-report/', 'node_modules/', 'public/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Only the two classic rules: v7's "recommended" adds React Compiler checks
      // (purity, set-state-in-effect) that need component refactors, not lint fixes.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    // Screens and components ask for data by name (src/db/repo.ts) instead of
    // reaching into Dexie, so what they may do to stored data is in one place.
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/db/db'],
              importNames: ['db'],
              message: 'Use a named query or change from src/db/repo.ts instead of the raw database handle.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-irregular-whitespace': 'off' },
  },
)
