import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"

// Flat config (ESLint 10). Encodes AGENTS.md's style guide as machine-
// enforced rules:
//   - prefer `const` over `let`
//   - avoid `else`, use early returns
//   - avoid `any`
// Plus the rules that catch real bugs: hook correctness (the chat screen's
// memo comparator depends on stable callbacks), and type-import hygiene.
export default tseslint.config(
  { ignores: ["node_modules/**", "android/**", "ios/**", "dist/**", "*.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Style guide: prefer const
      "prefer-const": "error",
      // Style guide: early returns over else
      "no-else-return": ["error", { allowElseIf: false }],
      // Style guide: avoid any
      "@typescript-eslint/no-explicit-any": "error",
      // Existing code uses `interface`/`type` consistently; keep it explicit
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  // Node scripts (plain JS, no TS) run under the Node runtime — teach
  // no-undef about Node globals instead of flagging every console/process.
  {
    files: ["scripts/**/*.mjs", "website/scripts/**/*.mjs", ".agents/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Node scripts that are TypeScript (tsx/test files) also need Node globals.
  {
    files: ["scripts/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // The website is a separate Next.js app (marketing site, not the RN app).
  // Same core rules, browser globals, no react-hooks (page components).
  {
    files: ["website/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
)
