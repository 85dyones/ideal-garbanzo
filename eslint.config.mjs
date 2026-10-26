import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

const raiz = import.meta.dirname;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Regras do typescript-eslint que usam informação de tipo.
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: raiz,
      },
    },
    settings: {
      // Raiz do projeto: a regra no-html-link-for-pages encontra as rotas em src/app/.
      next: {
        rootDir: raiz,
      },
    },
  },
  {
    // Arquivos de configuração em JavaScript ficam fora do tsconfig.
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Desliga as regras de estilo que conflitam com o Prettier; fica por último.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "docs/**",
    // Configuração do Claude Code e worktrees dos subagentes.
    ".claude/**",
  ]),
]);

export default eslintConfig;
