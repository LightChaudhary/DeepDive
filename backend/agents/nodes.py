import os
import requests
import re
import time

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from tavily import TavilyClient

from agents.state import AgentState, CriticOutput

load_dotenv()

# Initialize LLMs
llm = ChatGroq(
    model="openai/gpt-oss-120b",
    temperature=0,
    api_key=os.getenv("GROQ_API_KEY")
)

tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
}


def search_node(state: AgentState):
    print("--- SEARCH AGENT RUNNING ---")
    topic = state["topic"]

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert researcher. Generate exactly 2 highly specific search engine queries to research the following topic. Return them as a comma-separated list. Do not include any other text."),
        ("human", "Topic: {topic}")
    ])

    chain = prompt | llm
    response = chain.invoke({"topic": topic})
    queries = [q.strip() for q in response.content.split(",")]

    sources = []
    for query in queries:
        try:
            results = tavily.search(query=query, search_depth="basic", max_results=2)
            for result in results["results"]:
                sources.append({
                    "title": result["title"],
                    "url": result["url"],
                    "snippet": result["content"]
                })
        except Exception as e:
            print(f"Error searching for {query}: {e}")

    print(f"Found {len(sources)} sources.")
    return {"search_queries": queries, "sources": sources}


def reader_node(state: AgentState):
    print("--- READER AGENT RUNNING ---")
    sources = state["sources"]
    raw_content = []

    for source in sources:
        url = source["url"]
        print(f"Reading: {url}")

        try:
            response = requests.get(url, headers=HEADERS, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.extract()

            text = soup.get_text(separator=" ")
            text = " ".join(text.split())
            text = "".join(c for c in text if c.isprintable() or c == ' ')

            if len(text) > 3000:
                text = text[:3000] + "... [TRUNCATED]"

            raw_content.append(f"Source: {source['title']}\nURL: {url}\nContent:\n{text}")

        except Exception as e:
            print(f"Failed to read {url}: {e}")
            continue

    print(f"Successfully extracted text from {len(raw_content)} sources.")
    return {"raw_content": raw_content}


def writer_node(state: AgentState):
    print("--- WRITER AGENT RUNNING ---")
    topic = state["topic"]
    raw_content = state["raw_content"]
    context = "\n\n---\n\n".join(raw_content)

    critique = state.get("critique", "")
    revision_note = ""
    if critique and critique != "Good job":
        revision_note = f"\n\nIMPORTANT: Your previous draft was rejected. Here is the feedback you must fix:\n{critique}"

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a senior researcher and expert technical writer.
        Your task is to write a comprehensive, professional research report based ONLY on the provided context.
        
        Structure the report with:
        1. An Executive Summary
        2. Key Findings (as a bulleted list with citations)
        3. Conclusion
        
        Do not hallucinate or make up facts. If the context does not contain the answer, state that the information was not found in the sources."""),
        ("human", "Topic: {topic}\n\nContext:\n{context}\n{revision_note}")
    ])

    llm_writer = ChatGroq(
        model="openai/gpt-oss-120b",
        temperature=0.3,
        api_key=os.getenv("GROQ_API_KEY")
    )
    writer_chain = prompt | llm_writer

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = writer_chain.invoke({"topic": topic, "context": context, "revision_note": revision_note})
            print("Draft written.")
            return {"draft": response.content}
        except Exception as e:
            if "429" in str(e) or "RateLimitError" in str(e):
                print(f"Rate limit hit. Waiting 15 seconds (Attempt {attempt + 1}/{max_retries})...")
                time.sleep(15)
            else:
                print(f"Error writing draft: {e}")
                raise e

    return {"draft": state.get("draft", "Error: Could not generate draft due to API limits.")}


def critic_node(state: AgentState):
    print("--- CRITIC AGENT RUNNING ---")
    topic = state["topic"]
    draft = state["draft"]

    llm_critic = ChatGroq(
        model="openai/gpt-oss-120b",
        temperature=0.1,
        api_key=os.getenv("GROQ_API_KEY")
    )
    structured_llm = llm_critic.with_structured_output(CriticOutput)

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a senior research editor. 
        Review the provided draft report on the given topic.
        Evaluate it based on:
        1. Structure and clarity.
        2. Quality of writing.

        Give it a score from 1-10. 
        - A score of 8, 9, or 10 means the report is good enough to publish. Write 'Good job' for feedback.
        - A score below 8 means it needs improvements. Provide ONLY 2 specific, highly actionable bullet points to improve it."""),
        ("human", "Topic: {topic}\n\nDraft Report:\n{draft}")
    ])

    chain = prompt | structured_llm

    try:
        result = chain.invoke({"topic": topic, "draft": draft})
        print(f"Score: {result.score}/10")
        print(f"Feedback: {result.feedback}")

        revision_count = state.get("revision_count", 0) + 1

        return {
            "score": result.score,
            "critique": result.feedback,
            "revision_count": revision_count
        }

    except Exception as e:
        print(f"Critic failed to parse output: {e}")
        return {"score": 10, "critique": "Failed to generate critique.", "revision_count": state.get("revision_count", 0) + 1}