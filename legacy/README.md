# Legacy: intavue.ai (2023)

The original research prototype used in _The Probing Machine_ studies. Kept for reference
and comparison; it is not built or deployed.

- Flask + Jinja templates + Tailwind 3
- LangChain 0.0.242 with `gpt-3.5-turbo-16k`
- `poc.py` / `confidence_test.py` were map-reduce and chunking experiments with a Chroma
  vector store, needed because of the 16K context window
- `llm_logic.py#oneshot_process` is the prompt that ran in the study: five follow-up
  questions in a `Q / REFERENCE / INTENT` free-text format

The 2026 rebuild lives in the repository root — see the main README.
