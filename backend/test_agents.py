import pytest
from agents.nodes import search_node, reader_node

def test_search_agent():
    """Test that the search agent finds sources and returns queries."""
    initial_state = {
        "topic": "The history of the Roman Empire",
        "search_queries": [],
        "sources": [],
    }
    
    # Run the node
    result = search_node(initial_state)
    
    # Assertions (What we expect to happen)
    assert "search_queries" in result
    assert len(result["search_queries"]) > 0
    assert "sources" in result
    assert len(result["sources"]) > 0
    assert "url" in result["sources"][0]

def test_reader_agent():
    """Test that the reader agent can scrape a known URL."""
    initial_state = {
        "sources": [{"title": "Test", "url": "https://example.com"}],
        "raw_content": []
    }
    
    result = reader_node(initial_state)
    
    assert "raw_content" in result
    assert len(result["raw_content"]) > 0
    # Example.com has the word "Example" in its text
    assert "Example" in result["raw_content"][0]