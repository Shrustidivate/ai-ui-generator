import fs from "fs/promises";
import OpenAI from "openai";
import { applyChangePlan } from "./planUtils.js";
import { detectPolicyViolations, validateGeneratedCode, validatePlan } from "./validators.js";

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

export async function runAgent({ mode = "generate", userIntent, currentCode, lastPlan }) {
  if (!process.env.OPENAI_API_KEY) {
    return { error: "Missing OPENAI_API_KEY in backend environment." };
  }

  const safeMode = ["generate", "modify", "regenerate"].includes(mode) ? mode : "generate";
  const model = process.env.OPENAI_MODEL || "gpt-5";
  const policyWarnings = detectPolicyViolations(userIntent);
  const policyNotes = policyWarnings.length ? policyWarnings.join(" ") : "None.";

  if (safeMode === "modify" && !lastPlan) {
    return { error: "Modify requested without an existing plan." };
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
