function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function collectIds(node, ids) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (node.id) {
    ids.add(node.id);
  }

  const children = node.children || [];
  if (Array.isArray(children)) {
    children.forEach((child) => collectIds(child, ids));
  }
}

function ensureUniqueIds(node, ids, counter) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (!node.id || ids.has(node.id)) {
    let nextId = "";
    do {
      counter.value += 1;
      nextId = `node-${counter.value}`;
    } while (ids.has(nextId));
    node.id = nextId;
  }

  ids.add(node.id);

  const children = node.children || [];
  if (Array.isArray(children)) {
    children.forEach((child) => ensureUniqueIds(child, ids, counter));
  }
}

function findNodeWithParent(node, id, parent = null) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (node.id === id) {
    return { node, parent };
  }

  const children = node.children || [];
  if (!Array.isArray(children)) {
    return null;
  }

  for (const child of children) {
    const result = findNodeWithParent(child, id, node);
    if (result) {
      return result;
    }
  }

  return null;
}

export function applyChangePlan(basePlan, changePlan) {
  const errors = [];
  if (!basePlan || !basePlan.tree) {
    return { plan: basePlan, errors: ["Missing base plan."] };
  }

  const plan = deepClone(basePlan);
  const ids = new Set();
  collectIds(plan.tree, ids);
  const counter = { value: ids.size + 1 };

  const ops = changePlan?.operations || [];
  for (const op of ops) {
    if (op.op === "add") {
      const target = findNodeWithParent(plan.tree, op.parentId);
      if (!target || !target.node) {
        errors.push(`Add failed: parent ${op.parentId} not found.`);
        continue;
      }

      const newNode = deepClone(op.node);
      ensureUniqueIds(newNode, ids, counter);

      if (!Array.isArray(target.node.children)) {
        target.node.children = [];
      }

      if (op.position === "start") {
        target.node.children.unshift(newNode);
      } else if (op.position === "end" || op.position === undefined) {
        target.node.children.push(newNode);
      } else if (typeof op.position === "number") {
        target.node.children.splice(op.position, 0, newNode);
      } else {
        target.node.children.push(newNode);
      }
    }

    if (op.op === "remove") {
      if (op.targetId === plan.tree.id) {
        errors.push("Cannot remove root node.");
        continue;
      }
      const target = findNodeWithParent(plan.tree, op.targetId);
      if (!target || !target.parent) {
        errors.push(`Remove failed: node ${op.targetId} not found.`);
        continue;
      }
      target.parent.children = (target.parent.children || []).filter((child) => child.id !== op.targetId);
    }

    if (op.op === "update") {
      const target = findNodeWithParent(plan.tree, op.targetId);
      if (!target || !target.node) {
        errors.push(`Update failed: node ${op.targetId} not found.`);
        continue;
      }
      if (op.props && typeof op.props === "object") {
        target.node.props = { ...(target.node.props || {}), ...op.props };
      }
      if (typeof op.text === "string") {
        target.node.text = op.text;
      }
      if (Array.isArray(op.children)) {
        target.node.children = op.children;
      }
    }
  }

  return { plan, errors };
}