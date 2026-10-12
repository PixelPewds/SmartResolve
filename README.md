# SmartResolve

Predictive customer support triage and sentiment router.
Team BYTEFORCE, KITCOEK Hackathon, Advanced Track, AIML.

Every incoming complaint is redacted, classified and routed. Its priority is a hybrid score: urgency and impact judged at intake, plus waiting time and SLA risk that grow while it waits. Similar complaints are clustered and volume spikes flagged as candidate incidents for a supervisor to verify. Each ticket gets an explainable expert recommendation.

The full journey works end to end: customer submits, AI triage, priority scheduling, expert recommendation, incident detection, investigation, resolution, customer feedback, analytics.

## Run it locally

Requires Node 20 or newer. Nothing else: no database install, no API keys.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and use the **Customer**, **Support agent** or **Supervisor** buttons on the sign-in page. A **Demo guide** button (bottom right) walks through the whole journey in 8 steps, switching roles for you.

With no configuration the app uses an in-memory store seeded with about 157 sample tickets, and the local models. Both upgrade automatically when you add the environment variables below.

```bash
npm test        # behaviour checks for the triage engine
npm run build   # production build into dist/
```

## Stack (as in the deck)

| Layer | Used |
|---|---|
| Frontend | React 19, React Router, Tailwind CSS v4, Recharts, Phosphor icons, Geist |
| Backend | Node.js, Express 5, REST + JSON, Zod validation |
| Database | MongoDB (Atlas), with an in-memory fallback |
| AI | Hugging Face Inference API, with local fallback models |
| Auth | JWT in an httpOnly cookie, bcrypt password hashes, customer, agent and supervisor roles |
| Deploy | Vercel: static Vite build plus one Express serverless function |

## How the AI layer works

```
message -> PII redaction -> sentiment ---\
                         -> category  ----> priority engine -> routing -> KB suggestions
```

| Step | With `HF_TOKEN` | Without (default) |
|---|---|---|
| Sentiment | `cardiffnlp/twitter-roberta-base-sentiment-latest` | Lexicon with negation, intensifiers and support phrases ("charged twice", "still waiting") |
| Category | `facebook/bart-large-mnli` zero-shot over billing / technical / delivery / account / general | Weighted keyword classifier |
| Sarcasm guard | Applied to both | "Great job, six days late" is flipped to negative with lowered confidence |
| Priority | Rule engine, always local, fully explainable | same |
| Routing | Category default plus override rules | same |

Every Hugging Face call has a 3.5 s timeout and falls back to the local model on any error, so a slow or rate-limited API never blocks a ticket. The UI shows which engine produced each result.

### Hybrid priority (0 to 100)

| Factor | Max | Phase | Driven by |
|---|---|---|---|
| Urgency | 35 | Intake (AI) | Worst severity signal ("charged twice", "locked out", "outage", "fraud"), sentiment, repeat contact |
| Impact | 25 | Intake (AI) | Customer tier plus scope words ("entire team", "production", "revenue") |
| Waiting time | 20 | Live | `20 * (1 - e^(-hours/10))`, so it climbs fast at first then levels off |
| SLA risk | 20 | Live | Share of the current SLA clock used; full 20 once breached |

Live bands: P1 >= 70, P2 >= 52, P3 >= 34, else P4. The intake band (from the 60 intake points) sets the SLA targets.

Guardrails:

- **Routine requests are capped at P3** when there is no severity signal and no repeat contact, so an angry "how do I change my photo???" does not jump the queue.
- **Security and fraud language is floored at P2** and always routed to Account & Security.
- **Verified critical incidents**: once a supervisor confirms an incident as critical, every linked ticket is pinned to the top and floored at 85. A major incident adds 8 points. **Candidate incidents never change a score.**

Every ticket shows the breakdown, split into "AI assessment" and "Scheduling".

### SLA policy and escalation rules

| Band | First response | Resolution |
|---|---|---|
| P1 | 15 min | 4 h |
| P2 | 60 min | 8 h |
| P3 | 4 h | 24 h |
| P4 | 8 h | 72 h |

Warning at 75% of the clock. Rules R1 to R5 escalate automatically; manual escalation overrides them. The SLA management page lists each rule.

### Incident detection

TF-IDF cosine similarity groups complaints (greedy clustering plus a merge pass). For each group, the last 3 hours are compared with its 14-day baseline using a Poisson z-score; a spike needs at least 4 complaints and 3x the usual rate. A spike becomes a **candidate**. Only a supervisor can confirm (critical or major) or dismiss it. Confirming links every similar ticket, escalates them (rule R4) and tells the affected customers it is a known issue. Resolving the incident can close all linked tickets with one summary.

### Expert assignment

Match score = skill fit (45) + availability (20) + workload headroom (20) + similar tickets resolved (15). Every recommendation lists its reasons. Agents can only assign the top match; a supervisor can override to anyone, with a written reason that is logged.

### Model evaluation

37 hand-labelled complaints, 12 of them deliberately hard (sarcasm, Hinglish, mixed issues, polite wording of a serious problem), run live on every load of Feedback & learning. Current local-model results: category 86%, sentiment 78%, urgency 46% exact and 86% within one level. The set was also used while building the rules, so these numbers are optimistic. The Triage lab shows the wrong predictions next to the expected answer.

Agents can correct sentiment or category on any ticket. The score and route are recomputed and the correction is logged on Feedback & learning.

### Privacy

Card numbers (Luhn-checked), phone numbers, email addresses and OTP/PIN/CVV values are stripped from the message **before** it is stored or sent to any model. Customers never see internal scoring; that boundary is enforced in the API, not the UI.

## Using MongoDB (no local install needed)

You do not need MongoDB on this machine. Use MongoDB Atlas, which has a free tier and works the same locally and on Vercel.

1. Create a free cluster at https://www.mongodb.com/cloud/atlas/register (choose the **M0** free tier).
2. Database Access: add a user with a password.
3. Network Access: add `0.0.0.0/0`. Vercel functions have no fixed IP, so this is required for Vercel.
4. Connect > Drivers: copy the connection string, put your password in it.
5. Locally: copy `.env.example` to `.env` and set `MONGODB_URI`. Restart `npm run dev`.

On first connection the app creates its indexes and seeds the demo data once (guarded against concurrent cold starts). After that, tickets persist.

**Faster alternative on Vercel:** Project > Storage > Marketplace > MongoDB Atlas. Vercel creates the cluster and sets `MONGODB_URI` for you.

## Deploying to Vercel

1. Push this folder to a GitHub repository.
2. On https://vercel.com/new import the repository. The framework is detected as Vite; `vercel.json` already sets the build, output and API rewrites.
3. Add environment variables:
   - `JWT_SECRET`: **required** for a public deploy. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `MONGODB_URI`: strongly recommended (see below).
   - `HF_TOKEN`: optional, enables the hosted models. Create one at https://huggingface.co/settings/tokens with read access.
4. Deploy.

**Why `MONGODB_URI` matters on Vercel:** without it, each serverless instance holds its own in-memory copy of the demo data. Tickets you create can disappear between requests that land on different instances. Fine for clicking around, not for a live demo in front of judges.

## Project layout

```
api/index.js          Vercel entry, exports the Express app
server/
  app.js              routes: auth, tickets, incidents, assignment, SLA, analytics, learning, lab
  services.js         ticket enrichment, queue sort, incident sync, notifications
  sla.js              SLA policy, clocks, escalation rules
  store.js            MongoDB or in-memory, same interface
  seed.js             demo data (SIMULATED), run through the real pipeline
  auth.js             JWT cookie sessions, role guard
  dev.js              local server with a tiny .env loader
  ai/
    redact.js         PII removal
    sentiment.js      HF + lexicon + sarcasm guard
    classify.js       HF zero-shot + keyword classifier
    priority.js       hybrid scoring and guardrails
    similarity.js     TF-IDF vectors and cosine search
    incidents.js      clustering and spike detection
    experts.js        explainable expert matching
    evalset.js        labelled test set and evaluation
    routing.js        team assignment rules
    kb.js             help articles and recommender
    ai.test.js        behaviour checks
src/
  pages/Login.jsx
  pages/portal/       customer: 3-step request wizard, tracking, feedback, help centre
  pages/agent/        dashboard, queue, ticket workspace, incidents, assignment,
                      SLA, escalations, analytics, learning, triage lab, settings
  components/         shared UI kit, triage panels, thread, bell, demo guide
```

## Demo script (about 4 minutes)

The in-app **Demo guide** follows the same steps.

1. **Reset first.** Sign in as Supervisor, Settings, Reset demo data. Ticket ages, SLA clocks and the website spike are then relative to now.
2. **Customer submits.** Sign in as Customer, choose the "Website not loading" example. The AI preview (marked Simulated) shows category, urgency, tone and team as you type. Review, submit, note the request ID and the 5-step tracker.
3. **Agent dashboard.** Sign in as Support agent. The banner shows possible incidents. The queue is sorted by hybrid score; open any ticket and the breakdown shows intake points versus waiting and SLA points.
4. **Ticket workspace.** AI insights (with wrong-prediction correction), similar resolved tickets with their fixes, internal notes, timeline. Assign: an agent can only take the top recommendation and sees why.
5. **Incident watch.** Sign in as Supervisor. The website group is a candidate: 16 or more complaints in 3 hours against almost none in 14 days. Confirm as critical. The new ticket jumps to P1, pinned, escalated by rule R4, and the customer sees a "known issue" banner.
6. **Expert assignment.** Override a recommendation; a reason is required and logged.
7. **Resolve.** Resolve the incident with a root cause; its linked tickets close together.
8. **Feedback and learning.** As Customer, rate the resolved request. As staff, Feedback & learning shows ratings, agent corrections and the model evaluation, failures included.

## Demo accounts

The one-click buttons on the sign-in page use these. Set `DEMO_LOGIN=off` to disable the one-click endpoint.

| Role | Email | Password |
|---|---|---|
| Customer | rohan.mehta@example.com | customer-demo-2026 |
| Agent | agent@smartresolve.app | agent-demo-2026 |
| Supervisor | supervisor@smartresolve.app | supervisor-demo-2026 |

The supervisor confirms and dismisses incidents, overrides assignments, removes manual escalations and resets the demo data.

## What is real and what is simulated

Real, working: the triage pipeline on every ticket, hybrid scores and reasons, SLA clocks and escalation rules, similarity search, clustering and spike statistics, expert scores, the model evaluation, and every write (tickets, replies, notes, assignments, escalations, incidents, feedback) to the database.

Simulated: all customers, agents, availability and ticket history are invented sample data, as are the seeded ratings and corrections. Attachments record the file name only. Notifications are in-app only. Anything simulated carries a dashed "Simulated" tag in the UI; Settings lists both sides.

## Known limits of the prototype

- The local models are rule and lexicon based. They are transparent and fast, not state of the art; set `HF_TOKEN` for the transformer models.
- Sarcasm detection is a heuristic for one common pattern (praise plus a stated failure), not a general solution.
- No per-team permissions yet: any agent can see every queue.
- No email or WhatsApp ingestion; tickets come from the web portal. No outgoing email or SMS.
- Spike detection needs history to be meaningful. With an empty baseline it reports "new pattern" rather than a ratio.
- The evaluation set is small (37 cases) and not held out from rule development.
