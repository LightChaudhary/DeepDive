from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
import json
from graph import app as agent_app


app = FastAPI(title="Research Agent API")

# Allow React to talk to FastAPI (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, change this to your React URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

class ResearchRequest(BaseModel):
    topic: str


@app.post("/api/research")
async def research(request: ResearchRequest):
    """
    Endpoint that streams the agent's progress using Server-Sent Events (SSE).
    """

    initial_state = {
        "topic": request.topic,
        "search_queries": [],
        "sources": [],
        "raw_content": [],
        "draft": "",
        "critique": "",
        "score": 0,
        "revision_count": 0
    }

    async def event_generator():
        try:
            # Stream the LangGraph execution
            for event in agent_app.stream(initial_state):
                for node_name, state_update in event.items():
                    # We format the data to send to React
                    payload = {
                        "node": node_name,
                        "data": state_update
                    }

                    # Yield the event to the frontend
                    yield {
                        "event": "message",
                        "data": json.dumps(payload)
                    }
            # Send a final done signal
            yield {"event": "done", "data": "{}"}

        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())
