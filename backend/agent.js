import fs from "fs/promises";
import OpenAI from "openai";
import { applyChangePlan } from "./planUtils.js";
import { ALLOWED_COMPONENTS, detectPolicyViolations, validateGeneratedCode, validatePlan } from "./validators.js";

const PROMPT_CACHE = new Map();
const PROMPT_DIR = new URL("./prompts/", import.meta.url);

function truncate(value, max = 6000) {
  if (!value) {
    return "";
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}\n...[truncated]`;
}

async function loadPrompt(name) {
  if (PROMPT_CACHE.has(name)) {
    return PROMPT_CACHE.get(name);
  }
  const fileUrl = new URL(name, PROMPT_DIR);
  const content = await fs.readFile(fileUrl, "utf-8");
  PROMPT_CACHE.set(name, content);
  return content;
}

function fillPrompt(template, variables) {
  let output = template;
  for (const [key, value] of Object.entries(variables)) {
    output = output.replaceAll(`{{${key}}}`, value ?? "");
  }
  return output;
}

function stripCodeFence(text) {
  return text.replace(/```[a-zA-Z]*\n?/g, "");
}

function extractJson(text) {
  const cleaned = stripCodeFence(text).trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in response.");
  }
  const jsonText = cleaned.slice(start, end + 1);
  return JSON.parse(jsonText);
}

async function callModel(prompt, model, temperature = 0.2) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model,
    input: prompt,
    temperature
  });

  return response.output_text;
}

const COMPONENT_ORDER = [...ALLOWED_COMPONENTS];
const COMPONENT_KEYWORDS = {
  navbar: "Navbar",
  navigation: "Navbar",
  sidebar: "Sidebar",
  menu: "Sidebar",
  card: "Card",
  chart: "Chart",
  graph: "Chart",
  table: "Table",
  modal: "Modal",
  dialog: "Modal",
  input: "Input",
  form: "Input",
  button: "Button",
  cta: "Button"
};

function normalizeIntent(intent) {
  return (intent || "").toLowerCase();
}

function pickComponents(intent) {
  const lower = normalizeIntent(intent);
  const found = new Set();
  for (const [keyword, component] of Object.entries(COMPONENT_KEYWORDS)) {
    if (lower.includes(keyword)) {
      found.add(component);
    }
  }

  if (found.size === 0) {
    return ["Navbar", "Card", "Button"];
  }

  return COMPONENT_ORDER.filter((component) => found.has(component));
}

function createIdFactory() {
  const counter = { value: 0 };
  return {
    nextNodeId() {
      counter.value += 1;
      return `node-${counter.value}`;
    },
    nextTextId() {
      counter.value += 1;
      return `text-${counter.value}`;
    }
  };
}

function createTextNode(idFactory, text) {
  return { id: idFactory.nextTextId(), type: "text", text };
}

function createNode(idFactory, type, props = {}, children = []) {
  return { id: idFactory.nextNodeId(), type, props, children };
}

function buildMockPlan(userIntent) {
  const components = pickComponents(userIntent);
  const idFactory = createIdFactory();

  const headerChildren = [];
  if (components.includes("Navbar")) {
    headerChildren.push(
      createNode(idFactory, "Navbar", {
        title: "Project Atlas",
        links: ["Overview", "Metrics", "Settings"]
      })
    );
  } else {
    headerChildren.push(createTextNode(idFactory, "Workspace Overview"));
  }
  const headerSection = createNode(idFactory, "section", {}, headerChildren);

  const bodyChildren = [];
  if (components.includes("Sidebar")) {
    bodyChildren.push(
      createNode(idFactory, "Sidebar", {
        title: "Sections",
        items: ["Summary", "Reports", "Alerts"]
      })
    );
  }

  const contentChildren = [];
  let buttonPlaced = false;

  if (components.includes("Card")) {
    const cardChildren = [
      createTextNode(idFactory, "Snapshot of the latest activity and highlights.")
    ];
    if (components.includes("Button")) {
      cardChildren.push(
        createNode(idFactory, "Button", {}, [createTextNode(idFactory, "Primary Action")])
      );
      buttonPlaced = true;
    }
    contentChildren.push(
      createNode(idFactory, "Card", { title: "Highlights" }, cardChildren)
    );
  }

  if (components.includes("Chart")) {
    contentChildren.push(createNode(idFactory, "Chart", { title: "Weekly Activity" }));
  }

  if (components.includes("Table")) {
    contentChildren.push(
      createNode(idFactory, "Table", {
        columns: ["Metric", "Value"],
        rows: [
          ["Active Users", "1,204"],
          ["Conversion", "4.2%"],
          ["Sessions", "8,910"]
        ]
      })
    );
  }

  if (components.includes("Input")) {
    contentChildren.push(
      createNode(idFactory, "Input", {
        label: "Search",
        placeholder: "Filter by keyword"
      })
    );
  }

  if (components.includes("Modal")) {
    contentChildren.push(
      createNode(
        idFactory,
        "Modal",
        { title: "Invite Collaborators", open: true },
        [createTextNode(idFactory, "Send an invite to your teammates.")]
      )
    );
  }

  if (components.includes("Button") && !buttonPlaced) {
    contentChildren.push(
      createNode(idFactory, "Button", {}, [createTextNode(idFactory, "Primary Action")])
    );
  }

  if (contentChildren.length === 0) {
    contentChildren.push(createTextNode(idFactory, "No UI components requested."));
  }

  const contentSection = createNode(idFactory, "section", {}, contentChildren);
  const bodyRow = createNode(idFactory, "div", {}, [...bodyChildren, contentSection]);
  const mainSection = createNode(idFactory, "section", {}, [bodyRow]);

  return {
    kind: "plan",
    layout: "Header section with optional navigation and a content row for components.",
    components,
    tree: {
      id: "root",
      type: "div",
      props: {},
      children: [headerSection, mainSection]
    }
  };
}

function findFirstNodeByType(node, type) {
  if (!node || typeof node !== "object") {
    return null;
  }
  if (node.type === type) {
    return node;
  }
  const children = node.children || [];
  for (const child of children) {
    const result = findFirstNodeByType(child, type);
    if (result) {
      return result;
    }
  }
  return null;
}

function pickAddParentId(plan) {
  const children = plan?.tree?.children || [];
  if (children.length > 1 && children[1]?.id) {
    return children[1].id;
  }
  return plan?.tree?.id || "root";
}

function createMockNodeForType(type) {
  const idFactory = createIdFactory();
  switch (type) {
    case "Navbar":
      return createNode(idFactory, "Navbar", {
        title: "Updated Navigation",
        links: ["Home", "Insights", "Settings"]
      });
    case "Sidebar":
      return createNode(idFactory, "Sidebar", {
        title: "Quick Links",
        items: ["Overview", "Pipeline", "Alerts"]
      });
    case "Chart":
      return createNode(idFactory, "Chart", { title: "Updated Chart" });
    case "Table":
      return createNode(idFactory, "Table", {
        columns: ["Name", "Status"],
        rows: [
          ["Onboarding", "Active"],
          ["Review", "Pending"]
        ]
      });
    case "Input":
      return createNode(idFactory, "Input", {
        label: "Updated Input",
        placeholder: "Type here"
      });
    case "Modal":
      return createNode(
        idFactory,
        "Modal",
        { title: "Updated Modal", open: true },
        [createTextNode(idFactory, "Mock modal content.")]
      );
    case "Button":
      return createNode(idFactory, "Button", {}, [createTextNode(idFactory, "New Action")]);
    case "Card":
    default:
      return createNode(idFactory, "Card", { title: "New Card" }, [
        createTextNode(idFactory, "Added by mock change plan.")
      ]);
  }
}

function buildMockChangePlan(userIntent, lastPlan) {
  const intent = normalizeIntent(userIntent);
  const components = pickComponents(userIntent);
  const targetType = components[0] || "Card";
  const targetNode = lastPlan?.tree ? findFirstNodeByType(lastPlan.tree, targetType) : null;

  const wantsRemove = /(remove|delete|drop)/i.test(intent);
  const wantsUpdate = /(update|change|edit|rename)/i.test(intent);
  const wantsAdd = /(add|include|insert|append|create)/i.test(intent);

  const operations = [];
  let summary = "Applied minimal update.";

  if (wantsRemove && targetNode) {
    operations.push({ op: "remove", targetId: targetNode.id });
    summary = `Removed ${targetType}.`;
  } else if (wantsUpdate && targetNode) {
    const updateOperation = { op: "update", targetId: targetNode.id };
    if (targetType === "Button") {
      updateOperation.children = [
        { id: "text-900", type: "text", text: "Updated Action" }
      ];
    } else if (targetType === "Card") {
      updateOperation.props = { title: "Updated Summary" };
    } else if (targetType === "Navbar") {
      updateOperation.props = { title: "Updated Navigation" };
    } else if (targetType === "Sidebar") {
      updateOperation.props = { items: ["Updated", "Links", "List"] };
    } else if (targetType === "Table") {
      updateOperation.props = { rows: [["Updated", "Row"], ["Another", "Row"]] };
    } else if (targetType === "Chart") {
      updateOperation.props = { title: "Updated Chart" };
    } else if (targetType === "Input") {
      updateOperation.props = { placeholder: "Updated placeholder" };
    } else if (targetType === "Modal") {
      updateOperation.props = { title: "Updated Modal" };
    }
    operations.push(updateOperation);
    summary = `Updated ${targetType}.`;
  } else if (wantsAdd || !wantsRemove) {
    const parentId = pickAddParentId(lastPlan);
    operations.push({
      op: "add",
      parentId,
      position: "end",
      node: createMockNodeForType(targetType)
    });
    summary = `Added ${targetType}.`;
  } else {
    summary = "No matching component found to change.";
  }

  return {
    kind: "change_plan",
    summary,
    operations
  };
}

function collectComponents(node, used) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (ALLOWED_COMPONENTS.includes(node.type)) {
    used.add(node.type);
  }
  const children = node.children || [];
  if (Array.isArray(children)) {
    children.forEach((child) => collectComponents(child, used));
  }
}

function formatProps(props) {
  if (!props || typeof props !== "object") {
    return "";
  }
  return Object.entries(props)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}={${JSON.stringify(value)}}`)
    .join("");
}

function nodeToJsx(node, indent) {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return `${indent}${node.text || ""}`;
  }

  const props = formatProps(node.props);
  const openTag = `<${node.type}${props}>`;
  const children = Array.isArray(node.children) ? node.children : [];

  if (children.length === 0) {
    return `${indent}${openTag}</${node.type}>`;
  }

  const childLines = children.map((child) => nodeToJsx(child, `${indent}  `)).join("\n");
  return `${indent}${openTag}\n${childLines}\n${indent}</${node.type}>`;
}

function generateCodeFromPlan(plan) {
  const used = new Set();
  collectComponents(plan.tree, used);
  const ordered = COMPONENT_ORDER.filter((component) => used.has(component));
  const importLine =
    ordered.length === 0
      ? `import { Card } from \"./ui-kit\";`
      : `import { ${ordered.join(", ")} } from \"./ui-kit\";`;
  const jsx = nodeToJsx(plan.tree, "    ");

  return `${importLine}\n\nexport default function GeneratedUI() {\n  return (\n${jsx}\n  );\n}\n`;
}

function buildMockExplanation({ mode, plan, changePlan, policyNotes }) {
  const componentList = plan.components?.length ? plan.components.join(", ") : "No components";
  const intro =
    mode === "modify"
      ? `Applied a minimal change plan: ${changePlan?.summary || "updated the layout."}`
      : `Generated a layout with ${componentList}.`;
  const policyText =
    policyNotes && policyNotes !== "None."
      ? `Some requests were ignored due to deterministic rules: ${policyNotes}`
      : "All requests fit the deterministic rules.";

  return `${intro}\n\nPlan layout: ${plan.layout}\n\n${policyText}\n\nMock mode is enabled, so no external API calls were made.`;
}

async function runMockAgent({ mode, userIntent, lastPlan, policyNotes }) {
  let plan = null;
  let changePlan = null;

  if (mode === "modify") {
    changePlan = buildMockChangePlan(userIntent, lastPlan);
    const applied = applyChangePlan(lastPlan, changePlan);
    if (applied.errors.length) {
      return { error: `Change plan failed: ${applied.errors.join(" ")}` };
    }
    plan = applied.plan;
  } else {
    plan = buildMockPlan(userIntent);
  }

  const planValidation = validatePlan(plan);
  if (!planValidation.ok) {
    return { error: `Plan validation failed: ${planValidation.errors.join(" ")}` };
  }

  const code = generateCodeFromPlan(plan);
  const codeValidation = validateGeneratedCode(code);
  if (!codeValidation.ok) {
    return { error: `Code validation failed: ${codeValidation.errors.join(" ")}` };
  }

  const explanation = buildMockExplanation({ mode, plan, changePlan, policyNotes });

  return {
    plan,
    code,
    explanation,
    changePlan,
    mock: true
  };
}

export async function runAgent({ mode = "generate", userIntent, currentCode, lastPlan }) {
  const mockMode = ["1", "true", "yes"].includes((process.env.MOCK_AGENT || "").toLowerCase());
  const safeMode = ["generate", "modify", "regenerate"].includes(mode) ? mode : "generate";
  const model = process.env.OPENAI_MODEL || "gpt-5";
  const policyWarnings = detectPolicyViolations(userIntent);
  const policyNotes = policyWarnings.length ? policyWarnings.join(" ") : "None.";

  if (safeMode === "modify" && !lastPlan) {
    return { error: "Modify requested without an existing plan." };
  }

  if (mockMode) {
    return runMockAgent({ mode: safeMode, userIntent, lastPlan, policyNotes });
  }

  if (!process.env.OPENAI_API_KEY) {
    return { error: "Missing OPENAI_API_KEY in backend environment." };
  }

  const plannerTemplate = await loadPrompt("planner.txt");
  const plannerPrompt = fillPrompt(plannerTemplate, {
    MODE: safeMode,
    USER_INTENT: truncate(userIntent, 4000),
    CURRENT_CODE: truncate(currentCode, 4000),
    LAST_PLAN: lastPlan ? JSON.stringify(lastPlan, null, 2) : "(none)",
    POLICY_NOTES: policyNotes
  });

  let planResult;
  try {
    const plannerOutput = await callModel(plannerPrompt, model, 0.1);
    planResult = extractJson(plannerOutput);
  } catch (err) {
    return { error: `Planner failed: ${err.message}` };
  }

  let plan = planResult;
  let changePlan = null;

  if (safeMode === "modify") {
    changePlan = planResult;
    const applied = applyChangePlan(lastPlan, changePlan);
    plan = applied.plan;
    if (applied.errors.length) {
      return { error: `Change plan failed: ${applied.errors.join(" ")}` };
    }
  }

  const planValidation = validatePlan(plan);
  if (!planValidation.ok) {
    return { error: `Plan validation failed: ${planValidation.errors.join(" ")}` };
  }

  const generatorTemplate = await loadPrompt("generator.txt");
  const generatorPrompt = fillPrompt(generatorTemplate, {
    MODE: safeMode,
    PLAN: JSON.stringify(plan, null, 2),
    CHANGE_PLAN: changePlan ? JSON.stringify(changePlan, null, 2) : "(none)",
    CURRENT_CODE: truncate(currentCode, 6000)
  });

  let code;
  try {
    code = await callModel(generatorPrompt, model, 0.2);
  } catch (err) {
    return { error: `Generator failed: ${err.message}` };
  }

  const codeValidation = validateGeneratedCode(code);
  if (!codeValidation.ok) {
    return { error: `Code validation failed: ${codeValidation.errors.join(" ")}` };
  }

  const explainerTemplate = await loadPrompt("explainer.txt");
  const explainerPrompt = fillPrompt(explainerTemplate, {
    MODE: safeMode,
    USER_INTENT: truncate(userIntent, 4000),
    POLICY_NOTES: policyNotes,
    PLAN: JSON.stringify(plan, null, 2),
    CHANGE_PLAN: changePlan ? JSON.stringify(changePlan, null, 2) : "(none)"
  });

  let explanation = "";
  try {
    explanation = await callModel(explainerPrompt, model, 0.2);
  } catch (err) {
    explanation = `Explainer failed: ${err.message}`;
  }

  return {
    plan,
    code,
    explanation,
    changePlan
  };
}
