import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'jest.config.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
