# intavue

**A probing co-pilot for UX researchers.** Bring a recording, a transcript, or run your
session live. intavue reflects on the interview against your research questions and
suggests follow-up probes for the next session. Each suggestion is tied to a quote it has
checked against the transcript, and it never re-asks a question you already asked.

This is the 2026 rebuild of the 2023 `intavue.ai` prototype studied in _The Probing
Machine: Can Using GenAI Tools Help With Better Reflections During User Interviews_
(Tran, Parayno, Venkitachalam, Deja & Deja). The original Flask + LangChain +
`gpt-3.5-turbo-16k` code is preserved in [`legacy/`](legacy/) for comparison.

```
pnpm install
pnpm dev            # http://localhost:5173 — works offline in demo mode
```

Click **Explore the commuting demo study**. It loads the paper's study materials and a
real Taglish pilot transcript from 2022.

---

## What it does

|                     |                                                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Studies**         | A research goal, research questions (RQ1…), hypotheses (H1…), participant profile, interview language, session length.                                                                                                           |
| **Interviews in**   | Paste or upload `.txt` / Zoom & Teams `.vtt` / `.srt`. Or upload audio/video and have it transcribed with speaker diarization by Deepgram Nova-3. Or run a **live session**.                                                     |
| **Reflection**      | Verified probes (1–15, typed by probe kind and linked to RQs), per-RQ coverage, evidence for and against each hypothesis, "doors left open", feedback on your own question craft, and emergent themes.                           |
| **Agency**          | Optionally write your own follow-ups first. You can edit, refine (simpler / less leading / ask for a specific example / participant's language…), dismiss or rate any probe. Only what you keep goes into the guide.             |
| **Across sessions** | A coverage matrix across interviews, plus a next-session guide that carries forward (and exports to Markdown). Later reflections see earlier interviews.                                                                         |
| **Live co-pilot**   | In-person (mic) or remote (mic + meeting-tab audio). Shows coverage dots, your guide as an auto-ticking checklist, and at most two short nudges at a time. Rate-limited and pausable. A simulate mode replays a transcript.      |
| **Privacy**         | A consent gate before any AI processing. Emails, phone numbers and participant names are masked before text leaves the server. Audio is streamed to Deepgram and never stored. Deleting a study or interview removes everything. |

## What changed since the paper — and which limitations it addresses

| Finding / limitation in the paper                                                                                                         | What intavue does now                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GPT-3.5 with a 16K window: chunking, map-reduce, a Chroma vector store, free-text output shown raw.                                       | Claude (`claude-opus-5-5` by default) with a 1M-token window reads the full transcript **and every earlier interview in the study** in one pass. Output is **structured** (Zod → JSON Schema), so probes, quotes and coverage are typed data.                            |
| Transcripts were produced by hand and pasted in; STT wasn't reliable enough.                                                              | **Deepgram Nova-3** with diarization (including code-switching via `language=multi`) for uploads and live streaming. Meeting caption files are parsed directly, and speaker roles are inferred so you can correct them.                                                  |
| With short transcripts the model sometimes returned a question the interviewer had already asked (§6).                                    | A deterministic **verifier** compares every probe against every question the interviewer asked, your guide, and your own follow-ups, and rejects repeats. Rejected probes go through **one repair round** with the reasons. Anything still failing is shown, not hidden. |
| Participants doubted reliability and checked outputs against their expectations (P03, P12).                                               | Every quote is **located in the transcript** and labelled "verified" or "close match". Quotes that can't be found are removed, and clicking a quote jumps to that point in the transcript. Hypotheses get evidence for _and_ against.                                    |
| "The quintet": five probes were too few for 45+ minute sessions; participants wanted up to ten.                                           | **1–15 probes**, with a default that scales with session length, and a focus control (go deeper vs. fill gaps).                                                                                                                                                          |
| Post-interview only, to protect cognitive load; real-time support was left as future work.                                                | Post-interview stays the primary mode. **Live mode is optional** and built to be glanced at, not read: dots, a checklist, and at most two nudges, all pausable.                                                                                                          |
| Interviewers from different cultures had to rework their scripts (P03, P08). Better affordances for non-native speakers were recommended. | The participant profile and language shape the wording. Probes reuse the participant's own terms and language mix (e.g. Taglish). Adaptation notes flag cultural assumptions, and one-click refinements cover "simpler wording" and "participant's language".            |
| Agency, consent and data ethics (P05, P06, P10).                                                                                          | Your own follow-ups come first, every suggestion can be edited or dismissed, consent is gated, personal data is masked, nothing is retained that isn't needed, and you can delete everything.                                                                            |
| Interviews were treated in isolation.                                                                                                     | Multi-interview studies: per-RQ coverage across sessions, a carried-forward guide, and prior interviews as context.                                                                                                                                                      |

## How a reflection works

```
study brief + earlier interviews ─┐  (prompt-cached prefix)
this transcript ──────────────────┤
                                  ▼
                 Claude — generate N + spares (structured output)
                                  ▼
          verify in code: quotes found? already asked? duplicate?
                          yes/no? double-barreled? known RQ ids?
                                  ▼
          repair once with the reasons → verify again → top N
                                  ▼
              researcher keeps / edits / refines / dismisses
```

The pipeline lives in `src/lib/server/reflect.ts`, the checks in
`src/lib/server/llm/verify.ts`, and the prompts in `src/lib/server/llm/prompts.ts`.

## Configuration

Copy `.env.example` to `.env`. Every key is optional.

| Variable             | Default                 | Purpose                                                                                                     |
| -------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | –                       | Enables Claude. Without it the app runs a deterministic **demo heuristic** and shows a "Demo mode" badge.   |
| `INTAVUE_MODEL`      | `claude-opus-5-5`       | Model for reflections and refinements.                                                                      |
| `INTAVUE_EFFORT`     | `high`                  | `low` … `max`.                                                                                              |
| `INTAVUE_LIVE_MODEL` | `INTAVUE_MODEL`         | Live nudges run at low effort; set e.g. `claude-haiku-5-5` for lower latency.                               |
| `DEEPGRAM_API_KEY`   | –                       | Enables audio upload and live transcription. The key needs at least _Member_ role (to mint browser tokens). |
| `DEEPGRAM_MODEL`     | `nova-3`                |                                                                                                             |
| `DATABASE_URL`       | `file:data/intavue.db`  | libSQL URL: a local SQLite file, or `libsql://…` for Turso.                                                 |
| `ORIGIN`             | –                       | Public URL in production, if your proxy doesn't send `X-Forwarded-Proto/Host`.                              |
| `BODY_SIZE_LIMIT`    | `512K` (`1G` in Docker) | Max upload size for recordings.                                                                             |

Claude requests use adaptive thinking, prompt caching on the study brief and transcript,
streaming, and server-side refusal fallbacks (`fallbacks: "default"`). With fallbacks, a
safety-classifier false positive on a sensitive interview topic is retried on another
model instead of failing.

## Development

```
pnpm dev             # dev server
pnpm check           # svelte-check + TypeScript
pnpm lint            # prettier + eslint
pnpm test            # unit tests (Vitest)
pnpm test:e2e        # Playwright, against a production build in demo mode
pnpm eval            # eval harness (see below)
pnpm db:generate     # new Drizzle migration after editing src/lib/server/db/schema.ts
```

**Stack:** SvelteKit 3 + Svelte 5 (runes), TypeScript, Tailwind CSS 4, Drizzle ORM on
libSQL/SQLite, the Anthropic TypeScript SDK with Zod structured outputs, Deepgram over
REST and a browser WebSocket using short-lived tokens, Vitest, and Playwright.

```
src/lib/domain.ts               shared types + Zod schemas for model output
src/lib/server/llm/             Claude + mock providers, prompts, verifier
src/lib/server/reflect.ts       generate → verify → repair pipeline
src/lib/server/stt/deepgram.ts  transcription + browser token minting
src/lib/server/transcript/      VTT / SRT / labelled-text parsing, role inference
src/lib/live/                   browser audio capture → Deepgram WebSocket
src/routes/                     UI + JSON endpoints
eval/, scripts/eval.ts          eval cases and harness
legacy/                         the 2023 Flask prototype
```

### Evals

`pnpm eval` runs the reflection pipeline on three cases:

- the full Taglish pilot transcript;
- the same transcript cut to its first 16 turns, which reproduces the paper's short-interview failure case;
- a synthetic English Teams VTT.

It reports the measures the paper cared about: repeat rate, ungrounded-quote rate,
closed-question rate, delivered vs. requested probes, repairs, exact-quote share and
gap targeting. Add `--judge` for rubric scores from an LLM judge (open, non-leading,
grounded, depth, speakable) and `--runs 3` to see variance. Results go to
`eval/results/`. Without a key the harness measures the mock provider, which gives a
floor and exercises the harness in CI.

## Deploying

```
docker build -t intavue .
docker run -p 3000:3000 -v intavue-data:/data \
  -e ANTHROPIC_API_KEY=… -e DEEPGRAM_API_KEY=… intavue
```

The app is a single Node process (`node server.js`) with a SQLite file on a volume.
Reflections run in-process as background jobs. Live mode needs HTTPS (or `localhost`) for
microphone access.

There is no built-in authentication: intavue is meant to run for one researcher or a
small team behind your organisation's SSO or reverse proxy. Don't expose it publicly
as-is.

## Responsible use

intavue supports the interviewer and never replaces them. It is meant for reflection
between sessions. Live mode is opt-in because support during an interview can add
cognitive load. Make sure your consent forms cover AI transcription and processing, and
check that your organisation's data agreements cover Anthropic and Deepgram.
