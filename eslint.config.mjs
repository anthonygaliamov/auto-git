import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'out', 'node_modules', '.vscode-test', 'src/git.d.ts', 'esbuild.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
