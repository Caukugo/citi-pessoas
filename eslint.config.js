import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Variável não usada é erro, mas prefixar com _ marca "de propósito".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // `any` apaga a checagem de tipos — o que mais causa bug silencioso com IA.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Testes e fixtures podem ser mais soltos.
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'src/data/mock/fixtures.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
