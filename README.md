# SmartResolve

Predictive customer support triage and sentiment router.
Team BYTEFORCE, KITCOEK Hackathon, Advanced Track, AIML.

Every incoming complaint is redacted, classified, scored 0 to 100 with a reason for every point, and routed to the team that owns it. Agents work a queue sorted by risk; customers get a relevant help article while they wait.

## Run it locally

Requires Node 20 or newer. Nothing else: no database install, no API keys.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and use the **Support agent** or **Customer** buttons on the sign-in page.

With no configuration the app uses an in-memory store seeded with 86 realistic tickets, and the local models. Both upgrade automatically when you add the environment variables below.

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
| Auth | JWT in an httpOnly cookie, bcrypt password hashes, customer and agent roles |
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

### Priority engine (0 to 100)

| Factor | Max | Driven by |
|---|---|---|
| Issue severity | 35 | Worst matched signal: critical ("charged twice", "locked out", "outage", "fraud"), major, minor |
| Business impact | 25 | Customer tier plus scope words ("entire team", "production", "revenue") |
| Repeat contact | 20 | Earlier tickets from the same customer in 7 days |
| Customer frustration | 20 | Negative sentiment (max 12) plus explicit signals: capitals, "!!!", "third time" |

Bands: P1 >= 75 (1 h target), P2 >= 55 (4 h), P3 >= 35 (24 h), P4 (72 h).

Two guardrails answer the deck's risk slide directly:

- **Routine requests are capped at P3** when there is no severity signal and no repeat contact, so an angry "how do I change my photo???" does not jump the queue.
- **Security and fraud language is floored at P2** and always routed to Account & Security.

Agents can correct sentiment or category on any ticket. The score and route are recomputed and the correction is logged, which feeds the "model agreement" metric on the analytics page.

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
  app.js              routes: auth, tickets, analytics, triage lab
  store.js            MongoDB or in-memory, same interface
  seed.js             deterministic demo data, run through the real pipeline
  auth.js             JWT cookie sessions, role guard
  dev.js              local server with a tiny .env loader
  ai/
    redact.js         PII removal
    sentiment.js      HF + lexicon + sarcasm guard
    classify.js       HF zero-shot + keyword classifier
    priority.js       explainable scoring and guardrails
    routing.js        team assignment rules
    kb.js             help articles and recommender
    ai.test.js        behaviour checks
src/
  pages/Login.jsx
  pages/portal/       customer: raise and track requests
  pages/agent/        queue, ticket detail, analytics, triage lab
  components/         shared UI, triage panels, thread
```

## Demo script for judges (about 3 minutes)

1. **Sign in as Support agent.** The queue opens on an enterprise outage at P1 and a fraud report flagged for possible account compromise. Point out: colour only appears where it means something.
2. **Open the fraud ticket.** The four factors add up to less than 55, and the guardrail box shows it being floored to P2 anyway. This is the "explainable" claim, shown rather than told.
3. **Correct the sentiment** to Neutral on any ticket. Watch the score recompute. Mention this feeds model agreement on Analytics.
4. **Triage lab.** Run "Angry but routine": all caps, three exclamation marks, enterprise tier, still capped at P3. Then "Sarcastic praise": reads as praise to a normal model, flagged as possible sarcasm here. Then "Double charge, repeat": the card number is gone in the stored text.
5. **Analytics.** Volume by priority, negative sentiment trend, team load, SLA compliance, and recurring problems pulled from the classifier's own evidence.
6. **Sign out, sign in as Customer.** Submit a complaint. The confirmation names the team, the response target and suggests a help article before any human has replied.

## Demo accounts

The one-click buttons on the sign-in page use these. Set `DEMO_LOGIN=off` to disable the one-click endpoint.

| Role | Email | Password |
|---|---|---|
| Agent | agent@smartresolve.app | agent-demo-2026 |
| Customer | rohan.mehta@example.com | customer-demo-2026 |

## Known limits of the prototype

- The local models are rule and lexicon based. They are transparent and fast, not state of the art; set `HF_TOKEN` for the transformer models.
- Sarcasm detection is a heuristic for one common pattern (praise plus a stated failure), not a general solution.
- Single agent role, no per-team permissions yet.
- No email or WhatsApp ingestion; tickets come from the web portal.
