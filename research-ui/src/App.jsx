import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

function App() {
  const [topic, setTopic] = useState("The impact of quantum computing on modern cryptography");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [report, setReport] = useState("");
  const [finalScore, setFinalScore] = useState(null);

  const startResearch = async () => {
    if (!topic) return;

    // Reset state
    setLoading(true);
    setLogs([]);
    setReport("");
    setFinalScore(null);

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        // SSE messages start with "data: "
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);

              // Handle different agent nodes
              if (parsed.node === "search") {
                setLogs(prev => [...prev, `🔍 Search Agent found ${parsed.data.sources?.length || 0} sources.`]);
              } else if (parsed.node === "reader") {
                setLogs(prev => [...prev, `📖 Reader Agent scraped ${parsed.data.raw_content?.length || 0} pages.`]);
              } else if (parsed.node === "writer") {
                setLogs(prev => [...prev, `✍️ Writer Agent finished a draft.`]);
                setReport(parsed.data.draft); // Update the live report
              } else if (parsed.node === "critic") {
                const score = parsed.data.score;
                setFinalScore(score);
                if (score >= 8) {
                  setLogs(prev => [...prev, `🧐 Critic Agent approved! Score: ${score}/10`]);
                } else {
                  setLogs(prev => [...prev, `🧐 Critic Agent rejected. Score: ${score}/10. Sending back to Writer...`]);
                }
              }
            } catch (e) {
              console.error("Error parsing JSON:", e);
            }
          }
        }
      }
    } catch (error) {
      setLogs(prev => [...prev, `❌ Error: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-4xl mx-auto">

        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold mb-2">Multi-Agent Research Assistant</h1>
          <p className="text-gray-400">Powered by LangGraph, Groq, and FastAPI</p>
        </header>

        <div className="flex gap-4 mb-8">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="flex-1 p-4 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500"
            placeholder="Enter a research topic..."
          />
          <button
            onClick={startResearch}
            disabled={loading}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-bold transition-colors"
          >
            {loading ? "Researching..." : "Generate Report"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Left Column: Agent Logs */}
          <div className="col-span-1 bg-gray-800 p-6 rounded-lg border border-gray-700 h-[600px] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">Agent Activity</h2>
            <ul className="space-y-3">
              {logs.map((log, index) => (
                <li key={index} className="text-sm text-gray-300 animate-fade-in">
                  {log}
                </li>
              ))}
              {logs.length === 0 && <li className="text-sm text-gray-500 italic">Waiting to start...</li>}
            </ul>
          </div>

          {/* Right Column: Final Report */}
          <div className="col-span-1 md:col-span-2 bg-white text-gray-900 p-8 rounded-lg h-[600px] overflow-y-auto">
            {report ? (
              <>
                {finalScore && (
                  <div className={`mb-6 p-4 rounded-lg font-bold ${finalScore >= 8 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    Final Score: {finalScore}/10
                  </div>
                )}
                <div className="prose prose-lg max-w-none">
                  <ReactMarkdown>{report}</ReactMarkdown>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                The generated report will appear here.
              </div>
            )}
          </div>

        </div>
        {/* Add this footer */}
        <footer className="mt-12 text-right text-gray-500 text-sm">
          Built by <a href="https://github.com/LightChaudhary" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">@LightChaudhary</a>
        </footer>
      </div>
    </div>
  );
}

export default App;