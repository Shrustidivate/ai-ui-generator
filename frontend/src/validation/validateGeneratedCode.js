const DISALLOWED_TOKENS = [
  /className\s*=/,
  /style\s*=/,
  /tailwind/i,
  /@mui/i,
  /chakra/i,
  /styled-components/i
];

const ALLOWED_COMPONENTS = [
  "Button",
  "Card",
  "Input",
  "Table",
  "Modal",
  "Sidebar",
  "Navbar",
  "Chart"
];

const ALLOWED_HTML = ["div", "section"];

const ALLOWED_IMPORTS = ["./ui-kit", "./ui-kit/index", "./ui-kit/index.js"];

export function validateGeneratedCode(code) {
  const errors = [];

  if (!code || typeof code !== "string") {
    return { ok: false, errors: ["No code to validate."] };
  }

  for (const token of DISALLOWED_TOKENS) {
    if (token.test(code)) {
      errors.push(`Disallowed pattern detected: ${token}`);
    }
  }

  const importRegex = /import\s+[^;]+from\s+["']([^"']+)["']/g;
  let match = null;
  while ((match = importRegex.exec(code)) !== null) {
    const target = match[1];
    if (!ALLOWED_IMPORTS.includes(target)) {
      errors.push(`Invalid import target: ${target}`);
    }
  }

  const tagRegex = /<\s*([A-Za-z][A-Za-z0-9]*)/g;
  const seen = new Set();
  while ((match = tagRegex.exec(code)) !== null) {
    const tag = match[1];
    if (seen.has(tag)) {
      continue;
    }
    seen.add(tag);

    if (![...ALLOWED_COMPONENTS, ...ALLOWED_HTML].includes(tag)) {
      errors.push(`Invalid JSX tag: ${tag}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export const allowedComponentList = ALLOWED_COMPONENTS.slice();