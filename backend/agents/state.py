from typing import TypedDict, List
from pydantic import BaseModel, Field


class AgentState(TypedDict):
    topic: str
    search_queries: List[str]
    sources: List[dict]
    raw_content: List[str]
    draft: str
    critique: str
    score: int
    revision_count: int


class CriticOutput(BaseModel):
    score: int = Field(description="A score from 1 to 10 rating the quality of the report.")
    feedback: str = Field(description="Specific, actionable feedback. If score >= 8, write 'Good job'.")