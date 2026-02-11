const DISALLOWED_PATTERNS = [
  { regex: /className\s*=/, message: "className is not allowed" },
  { regex: /style\s*=/, message: "style props are not allowed" },
  { regex: /tailwind/i, message: "Tailwind usage is not allowed" },
  { regex: /@mui/i, message: "Material UI imports are not allowed" },
  { regex: /chakra/i, message: "Chakra UI imports are not allowed" },
  { regex: /styled-components/i, message: "styled-components are not allowed" }
];

export const ALLOWED_COMPONENTS = [
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

  for (const { regex, message } of DISALLOWED_PATTERNS) {
    if (regex.test(code)) {
      errors.push(message);
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateNode(node, path, errors) {
  if (node == null) {
    return;
  }

  if (typeof node === "string") {
    return;
  }

  if (!isPlainObject(node)) {
    errors.push(`Invalid node at ${path}`);
    return;
  }

  const { type, props, children, text } = node;

  if (type === "text") {
    if (typeof text !== "string") {
      errors.push(`Text node missing text at ${path}`);
    }
    return;
  }

  if (![...ALLOWED_COMPONENTS, ...ALLOWED_HTML].includes(type)) {
    errors.push(`Invalid node type ${type} at ${path}`);
  }

  if (props && !isPlainObject(props)) {
    errors.push(`Invalid props at ${path}`);
  }

  if (props && ("className" in props || "style" in props)) {
    errors.push(`Disallowed styling props at ${path}`);
  }

  if (Array.isArray(children)) {
    children.forEach((child, index) => validateNode(child, `${path}.${type}[${index}]`, errors));
  }
}

export function validatePlan(plan) {
  const errors = [];

  if (!plan || !plan.tree) {
    return { ok: false, errors: ["Missing plan tree."] };
  }

  validateNode(plan.tree, "root", errors);

  return { ok: errors.length === 0, errors };
}

export function detectPolicyViolations(intent = "") {
  const warnings = [];
  const lower = intent.toLowerCase();

  if (/(tailwind|className|inline style|styled-components|@mui|chakra|material ui|bootstrap)/i.test(lower)) {
    warnings.push("Styling or external UI library request ignored.");
  }

  if (/(create a new component|new component|custom component)/i.test(lower)) {
    warnings.push("Requests for new components are ignored.");
  }

  if (/import\s+.*from\s+['\"]/i.test(intent)) {
    warnings.push("Import directives are ignored.");
  }

  return warnings;
}