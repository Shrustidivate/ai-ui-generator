export async function runAgent(payload) {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error || "Agent request failed.";
    throw new Error(message);
  }

  return data;
}