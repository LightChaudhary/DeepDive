from langgraph.graph import StateGraph, END
from agents.state import AgentState
from agents.nodes import search_node, reader_node, writer_node, critic_node

workflow = StateGraph(AgentState)
workflow.add_node("search", search_node)
workflow.add_node("reader", reader_node)
workflow.add_node("writer", writer_node)
workflow.add_node("critic", critic_node)

workflow.set_entry_point("search")
workflow.add_edge("search", "reader")
workflow.add_edge("reader", "writer")
workflow.add_edge("writer", "critic")


def should_continue(state: AgentState):
    if not state.get("raw_content"):
        return END
    score = state.get("score")
    if score is None or score >= 8:   # None = the review failed; don't loop
        return END
    if state.get("revision_count", 0) >= 3:
        return END
    return "writer"


workflow.add_conditional_edges("critic", should_continue)
app = workflow.compile()