# AI Agent ? Deterministic UI Generator

A full-stack app that turns user intent into a deterministic UI plan + constrained React code, then renders a live preview using a fixed component library.

## Architecture
- **Frontend (React + Vite):** 3-pane layout (intent/explainer, code editor, live preview) and version history.
- **Backend (Node + Express):** `/api/agent` runs Planner ? Generator ? Explainer using the OpenAI API.
- **Storage:** In-memory history on the frontend, persisted to `localStorage`.
- **Rendering:** Live preview renders the JSON plan with a deterministic renderer (no eval).

## Agent Pipeline
The backend runs three steps in `/api/agent`:
1. **Planner** — converts intent (plus current code/plan) into a JSON plan or change plan.
2. **Generator** — converts the plan into a single-file React component string.
3. **Explainer** — explains decisions and changes.

Prompt templates are stored in `backend/prompts/`:
- `backend/prompts/planner.txt`
- `backend/prompts/generator.txt`
- `backend/prompts/explainer.txt`

## Component System Rules (Deterministic Constraints)
Generated UI code **must** follow these rules:
- Only import from `src/ui-kit/index.js` (generated code uses `./ui-kit`).
- Use only these components: `Button`, `Card`, `Input`, `Table`, `Modal`, `Sidebar`, `Navbar`, `Chart`.
- Layout is composed with only `div` and `section` tags.
- No `className`, no `style`, no Tailwind, no external UI libraries.
- The AI must never create new components or CSS.

Validation happens both server-side and client-side before preview renders.

## Setup
1. Install dependencies:

```bash
npm install
npm run install:all
```

2. Configure backend env:
- Copy `backend/.env.example` to `backend/.env`
- Set `OPENAI_API_KEY`
- Optionally set `OPENAI_MODEL`
- To run without an API key for demos, set `MOCK_AGENT=1`

3. Run both frontend + backend:

```bash
npm run dev
```

Frontend: `http://localhost:5173`
Backend: `http://localhost:5174`

## Usage
- **Generate UI:** First-time creation from an intent.
- **Modify Existing UI:** Incremental change based on last plan.
- **Regenerate:** Fresh plan + code from intent.
- **Roll Back:** Switch to a previous version.

## Known Limits
- Manual edits in the code editor are validated but not parsed into the plan.
- LLM output must pass strict validation; invalid output is rejected.
- Complex layout logic is limited to `div`/`section` and the fixed UI kit.

## Next Improvements
1. Parse validated JSX into a plan to reflect manual edits in the preview.
2. Add diff visualization between versions.
3. Add richer plan validation (prop validation per component).
4. Add streaming responses for the explainer.