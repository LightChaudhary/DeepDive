# Multi-Agent Research Assistant 🚀

An autonomous multi-agent AI system that generates comprehensive research reports from scratch. It uses 4 specialized agents that collaborate, self-critique, and iterate until the final report meets a high-quality threshold.

## 🏗️ Architecture

The system is built using **LangGraph** to orchestrate the state and control flow between agents. It uses **Groq (Llama-3)** for ultra-fast inference.

```text
[User Input] 
    ↓
[Search Agent] — Uses Tavily API to find relevant URLs
    ↓
[Reader Agent] — Scrapes web pages with BeautifulSoup
    ↓
[Writer Agent] — Generates a structured report with citations
    ↓
[Critic Agent] — Scores the report (1-10) and provides feedback
    ↓
(If score < 8 and revisions < 2) → Loops back to Writer Agent
    ↓
[Final Report]