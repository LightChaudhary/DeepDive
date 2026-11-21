import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const STORE = "research-chats-v1";
const EXAMPLES = [
  "The impact of quantum computing on modern cryptography",
  "How do mRNA vaccines work?",
  "The future of solid-state batteries",
];
const QUICK = ["Summarize in 3 bullets", "Explain it simply", "Make it shorter"];

const uid = () => Math.random().toString(36).slice(2, 10);
const loadChats = () => {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || [];
  } catch {
    return [];
  }
};
const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
const scoreStyle = (s) =>
  s >= 8 ? "bg-emerald-100 text-emerald-800" : s >= 6 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800";

// Markdown styled directly, so no typography plugin is needed.
// eslint-disable-next-line no-unused-vars
const tag = (Tag, cls) => ({ node, ...props }) => <Tag className={cls} {...props} />;
const md = {
  h1: tag("h1", "mb-5 text-3xl font-bold leading-tight tracking-tight text-slate-900"),
  h2: tag("h2", "mt-9 mb-3 border-b border-slate-200 pb-2 text-xl font-bold text-slate-900"),
  h3: tag("h3", "mt-6 mb-2 text-lg font-semibold text-slate-900"),
  p: tag("p", "my-4 text-[1.05rem] leading-8 text-slate-700"),
  ul: tag("ul", "my-4 list-disc space-y-3 pl-6 text-[1.05rem] leading-8 text-slate-700 marker:text-slate-400"),
  ol: tag("ol", "my-4 list-decimal space-y-2 pl-6 text-[1.05rem] leading-8 text-slate-700 marker:text-slate-400"),
  li: tag("li", "pl-1"),
  strong: tag("strong", "font-semibold text-slate-900"),
  hr: tag("hr", "my-8 border-slate-200"),
  // eslint-disable-next-line no-unused-vars
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700" />
  ),
};

export default function App() {
  const [chats, setChats] = useState(loadChats);
  const [activeId, setActiveId] = useState(() => loadChats()[0]?.id ?? null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef(null);
  const canvasRef = useRef(null);
  const chat = chats.find((c) => c.id === activeId) || null;

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(chats));
    } catch {
      /* storage full or blocked: history just won't persist */
    }
  }, [chats]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length, busy]);

  useEffect(() => {
    canvasRef.current?.scrollTo({ top: 0 });
  }, [chat?.id, chat?.version]);

  const patch = (id, fn) => setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  const say = (id, role, text) => patch(id, (c) => ({ ...c, messages: [...c.messages, { role, text }] }));

  const startResearch = async (topic) => {
    const id = uid();
    setChats((cs) => [
      {
        id, title: topic, report: "", score: null, sources: [], version: 0,
        messages: [
          { role: "user", text: topic },
          { role: "agent", text: "On it. I will search, read, write and review a report. This usually takes a minute." },
        ],
      },
      ...cs,
    ]);
    setActiveId(id);
    setBusy(true);
    let drafts = 0;
    let lastDraft = "";
    try {
      const res = await fetch(`${API_URL}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status} ${res.statusText}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let got = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // sse-starlette sends \r\n line endings; normalize before splitting
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        const parts = buffer.split("\n\n");
        buffer = parts.pop();

        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const str = line.replace(/^data:\s?/, "").trim();
            if (!str || str === "{}") continue;
            let ev;
            try {
              ev = JSON.parse(str);
            } catch {
              continue;
            }
            got = true;
            if (ev.error) {
              say(id, "agent", `Something went wrong: ${ev.error}`);
              continue;
            }
            const d = ev.data || {};
            if (ev.node === "search") {
              patch(id, (c) => ({ ...c, sources: d.sources || [] }));
              say(id, "agent", `Found ${d.sources?.length || 0} sources.`);
            } else if (ev.node === "reader") {
              say(id, "agent", `Read ${d.raw_content?.length || 0} pages.`);
            } else if (ev.node === "writer") {
              if (!d.draft) {
                say(id, "agent", "The writer returned an empty draft, so the canvas still shows the previous version.");
              } else {
                const same = d.draft === lastDraft;
                lastDraft = d.draft;
                drafts += 1;
                patch(id, (c) => ({ ...c, report: d.draft, version: drafts }));
                say(id, "agent", drafts === 1
                  ? "The first draft is on the canvas. Sending it to the reviewer."
                  : same
                    ? `Revision ${drafts - 1} came back identical to the previous draft. Reviewing again.`
                    : `Revision ${drafts - 1} is on the canvas. Reviewing again.`);
              }
            } else if (ev.node === "critic") {
              const s = typeof d.score === "number" ? d.score : null;
              patch(id, (c) => ({ ...c, score: s }));
              const ok = s !== null && s >= 8;
              say(id, "agent", s === null ? "The review could not be completed, so this draft is not reviewed." : ok ? `The reviewer approved it with ${s}/10.` : `The reviewer scored it ${s}/10 and asked for changes.`);
              const notes = (d.critique || "").trim();
              if (s !== null && !ok && notes && notes.toLowerCase() !== "good job") say(id, "note", notes);
            }
          }
        }
      }
      if (!got) say(id, "agent", "The server sent no events. Check the backend terminal.");
      else if (drafts > 0) say(id, "agent", "Done. Ask a question about the report, or tell me what to change.");
    } catch (e) {
      say(id, "agent", `Could not finish: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const followUp = async (c, text) => {
    say(c.id, "user", text);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: c.title, report: c.report, message: text }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status} ${res.statusText}`);
      const r = await res.json();
      if (r.kind === "revision") {
        patch(c.id, (x) => ({ ...x, report: r.text, version: x.version + 1, score: null }));
        say(c.id, "agent", "I updated the report on the canvas.");
      } else {
        say(c.id, "agent", r.text);
      }
    } catch (e) {
      say(c.id, "agent", `Could not do that: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
    if (chat?.report) followUp(chat, t);
    else startResearch(t);
  };

  const deleteChat = (id) => {
    setChats((cs) => cs.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(chat.report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      say(chat.id, "agent", "Could not copy. Your browser blocked clipboard access.");
    }
  };

  const downloadReport = () => {
    const url = URL.createObjectURL(new Blob([chat.report], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chat.title.slice(0, 40).replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "report"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bubble = {
    user: "ml-auto rounded-2xl rounded-br-sm bg-blue-500 text-white",
    agent: "mr-auto rounded-2xl rounded-bl-sm bg-slate-800 text-slate-200",
    note: "mr-auto rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-100",
  };

  return (
    <div className="grid min-h-screen bg-slate-950 font-sans text-slate-100 lg:h-screen lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1.25fr)]">
      {/* History */}
      <aside className="flex max-h-56 flex-col border-b border-slate-800 p-4 lg:max-h-none lg:border-b-0 lg:border-r">
        <button
          onClick={() => { setActiveId(null); setInput(""); }}
          className="rounded-lg bg-blue-500 px-4 py-2.5 font-semibold hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
        >
          New research
        </button>
        <nav aria-label="Past research" className="mt-4 flex-1 overflow-y-auto">
          {chats.length === 0 && <p className="text-sm text-slate-500">Your research will be saved here.</p>}
          <ul className="space-y-1">
            {chats.map((c) => (
              <li key={c.id} className="flex items-center">
                <button
                  onClick={() => setActiveId(c.id)}
                  className={`min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-sm ${c.id === activeId ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900"}`}
                >
                  {c.title}
                </button>
                <button onClick={() => deleteChat(c.id)} aria-label={`Delete ${c.title}`} className="px-2 text-slate-600 hover:text-rose-400">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Conversation */}
      <section aria-label="Conversation" className="flex h-[75vh] min-h-0 flex-col lg:h-auto">
        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {!chat ? (
            <div className="pt-10">
              <h1 className="text-3xl font-bold tracking-tight">What do you want to research?</h1>
              <p className="mt-2 text-slate-400">Agents search, read, write and review a sourced report. Then you can ask questions about it.</p>
              <div className="mt-6 flex flex-col items-start gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => startResearch(ex)} disabled={busy} className="rounded-lg border border-slate-700 px-4 py-2 text-left text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.messages.map((m, i) => (
              <div key={i} className={`max-w-[88%] whitespace-pre-wrap px-4 py-2.5 leading-6 ${bubble[m.role]}`}>
                {m.role === "note" && <p className="mb-1 font-medium">Reviewer notes</p>}
                {m.text}
              </div>
            ))
          )}
          {busy && <p className="text-sm text-slate-500 motion-safe:animate-pulse">Working...</p>}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-800 p-4">
          {chat?.report && !busy && (
            <div className="mb-3 flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button key={q} onClick={() => followUp(chat, q)} className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-slate-500 hover:text-white">
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              disabled={busy}
              aria-label="Message"
              placeholder={chat?.report ? "Ask about the report or request a change" : "Enter a research topic"}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 disabled:opacity-60"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-lg bg-blue-500 px-5 py-3 font-semibold hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {chat?.report ? "Send" : "Research"}
            </button>
          </div>
        </div>
      </section>

      {/* Canvas */}
      <section ref={canvasRef} aria-label="Report" className="border-t border-slate-800 bg-slate-900/40 p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
        {chat?.report ? (
          <article className="mx-auto max-w-3xl rounded-lg bg-slate-50 text-slate-900 shadow-xl">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-3">
              <span className="font-semibold">Version {chat.version}</span>
              {chat.score !== null ? (
                <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${scoreStyle(chat.score)}`}>Review {chat.score}/10</span>
              ) : (
                <span className="text-sm text-slate-500">Not reviewed</span>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={copyReport} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
                  {copied ? "Copied" : "Copy"}
                </button>
                <button onClick={downloadReport} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
                  Download .md
                </button>
              </div>
            </div>
            <div className="mx-auto max-w-[68ch] px-6 py-8 font-serif">
              <ReactMarkdown components={md}>{chat.report}</ReactMarkdown>
            </div>
            {chat.sources.length > 0 && (
              <details className="border-t border-slate-200 px-6 py-4 text-sm">
                <summary className="cursor-pointer font-medium">Sources searched ({chat.sources.length})</summary>
                <ul className="mt-3 space-y-2">
                  {chat.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{s.title}</a>
                      <span className="text-slate-500"> ({host(s.url)})</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ) : busy && chat ? (
          <div className="mx-auto max-w-3xl space-y-4 rounded-lg bg-slate-50 p-10" aria-busy="true" aria-label="Writing the report">
            <div className="h-8 w-2/3 rounded bg-slate-200 motion-safe:animate-pulse" />
            {[100, 95, 90, 100, 70, 95, 80].map((w, i) => (
              <div key={i} className="h-4 rounded bg-slate-200 motion-safe:animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center text-center">
            <p className="text-lg font-semibold text-slate-300">The report appears here</p>
            <p className="mt-2 max-w-xs text-slate-500">Start a research on the left. You can edit and ask about the report afterwards.</p>
          </div>
        )}
      </section>
    </div>
  );
}