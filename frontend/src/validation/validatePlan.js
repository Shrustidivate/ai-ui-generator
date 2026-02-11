import { allowedComponentList } from "./validateGeneratedCode.js";

const ALLOWED_HTML = ["div", "section"];

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

  if (![...allowedComponentList, ...ALLOWED_HTML].includes(type)) {
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