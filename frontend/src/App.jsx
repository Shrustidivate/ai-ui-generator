import { useEffect, useMemo, useState } from "react";
import { runAgent } from "./api/agent.js";
import UiTreeRenderer from "./renderer/UiTreeRenderer.jsx";
import { validateGeneratedCode } from "./validation/validateGeneratedCode.js";
import { validatePlan } from "./validation/validatePlan.js";

const STORAGE_KEY = "deterministic-ui-generator-versions";

function formatTimestamp(value) {
  return new Date(value).toLocaleString();
}

export default function App() {
  const [userIntent, setUserIntent] = useState("");
  const [currentPlan, setCurrentPlan] = useState(null);
  const [currentCode, setCurrentCode] = useState("");
  const [explanation, setExplanation] = useState("");
  const [versions, setVersions] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setVersions(parsed);
        const latest = parsed[parsed.length - 1];
        applyVersion(latest);
      }
    } catch (err) {
      console.warn("Failed to parse stored versions", err);
    }
  }, []);

  useEffect(() => {
    if (versions.length === 0) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  }, [versions]);

  const codeValidation = useMemo(() => validateGeneratedCode(currentCode), [currentCode]);
  const planValidation = useMemo(() => validatePlan(currentPlan), [currentPlan]);

  const previewReady = codeValidation.ok && planValidation.ok && !error;

  function applyVersion(version) {
    setCurrentPlan(version.plan);
    setCurrentCode(version.code);
    setExplanation(version.explanation);
    setUserIntent(version.userIntent || "");
    setError("");
  }

  async function handleAgent(mode) {
    if (!userIntent.trim()) {
      setError("Enter a user intent before running the agent.");
      return;
    }

    if (mode === "modify" && !currentPlan) {
      setError("No existing plan to modify yet. Generate a UI first.");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const payload = {
        mode,
        userIntent,
        currentCode,
        lastPlan: currentPlan
      };

      const result = await runAgent(payload);

      if (result.error) {
        setError(result.error);
        return;
      }

      const nextVersion = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        userIntent,
        plan: result.plan,
        code: result.code,
        explanation: result.explanation
      };

      setVersions((prev) => [...prev, nextVersion]);
      applyVersion(nextVersion);
    } catch (err) {
      setError(err.message || "Failed to reach agent.");
    } finally {
      setStatus("idle");
    }
  }

  function handleRollback() {
    if (versions.length < 2) {
      setError("No previous version to roll back to.");
      return;
    }

    const previous = versions[versions.length - 2];
    applyVersion(previous);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI Agent ? Deterministic UI Generator</p>
          <h1>Claude-Code Style Builder</h1>
        </div>
        <div className={`status status-${status}`}>{status === "loading" ? "Running" : "Idle"}</div>
      </header>

      <main className="panes">
        <section className="pane pane-left">
          <div className="pane-section">
            <h2>Intent</h2>
            <textarea
              className="intent-input"
              value={userIntent}
              onChange={(event) => setUserIntent(event.target.value)}
              placeholder="Describe the UI you want..."
            />
            <div className="button-row">
              <button className="action" onClick={() => handleAgent("generate")} disabled={status === "loading"}>
                Generate UI
              </button>
              <button className="action" onClick={() => handleAgent("modify")} disabled={status === "loading"}>
                Modify Existing UI
              </button>
              <button className="action" onClick={() => handleAgent("regenerate")} disabled={status === "loading"}>
                Regenerate
              </button>
              <button className="action" onClick={handleRollback} disabled={status === "loading"}>
                Roll Back
              </button>
            </div>
            {error ? <div className="error">{error}</div> : null}
          </div>

          <div className="pane-section">
            <h2>Explanation</h2>
            <div className="explanation">{explanation || "No explanation yet."}</div>
          </div>

          <div className="pane-section">
            <h2>Version History</h2>
            <div className="history">
              {versions.length === 0 ? (
                <p className="muted">No versions saved yet.</p>
              ) : (
                versions
                  .slice()
                  .reverse()
                  .map((version) => (
                    <button
                      key={version.id}
                      className="history-item"
                      onClick={() => applyVersion(version)}
                    >
                      <span>{formatTimestamp(version.timestamp)}</span>
                      <span className="muted">{version.userIntent?.slice(0, 38) || "Untitled"}</span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </section>

        <section className="pane pane-middle">
          <div className="pane-section grow">
            <div className="pane-header">
              <h2>Generated Code</h2>
              <span className={`pill ${codeValidation.ok ? "pill-ok" : "pill-warn"}`}>
                {codeValidation.ok ? "Valid" : "Blocked"}
              </span>
            </div>
            <textarea
              className="code-editor"
              value={currentCode}
              onChange={(event) => setCurrentCode(event.target.value)}
              placeholder="Generated component code will appear here."
            />
            <p className="muted">Preview uses the latest plan. Manual edits are validated but not parsed.</p>
            {!codeValidation.ok ? (
              <ul className="validation-list">
                {codeValidation.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section className="pane pane-right">
          <div className="pane-section grow">
            <div className="pane-header">
              <h2>Live Preview</h2>
              <span className={`pill ${previewReady ? "pill-ok" : "pill-warn"}`}>
                {previewReady ? "Ready" : "Blocked"}
              </span>
            </div>
            <div className="preview">
              {previewReady ? (
                <UiTreeRenderer plan={currentPlan} />
              ) : (
                <p className="muted">
                  Preview blocked until the generated code and plan both validate.
                </p>
              )}
            </div>
            {!planValidation.ok ? (
              <ul className="validation-list">
                {planValidation.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}