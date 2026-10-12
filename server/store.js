// Data layer. Two implementations behind one small interface:
//
//   MONGODB_URI set   -> MongoDB (Atlas)
//   MONGODB_URI unset -> in-process memory
//
//   all(col)  get(col, id)  insert(col, doc)  update(col, id, patch)
//   seq(name)  reseed()
//
// Collections hold a few hundred documents, so "load all, filter in JS" is
// simpler than building query translation for two backends.
//
// SEED_VERSION: bump it when the data model changes. On the next cold start
// the database is wiped and re-seeded exactly once, guarded by a lock
// document so concurrent serverless instances cannot both seed.

import { MongoClient } from 'mongodb';
import { buildSeed } from './seed.js';

export const SEED_VERSION = 3;
const COLLECTIONS = ['users', 'tickets', 'incidents', 'notifications', 'reads', 'counters'];
const clone = (x) => (x == null ? x : structuredClone(x));

function memoryStore() {
  const db = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));
  const store = {
    mode: 'memory',
    seededAt: null,
    all: async (col) => [...db[col].values()].map(clone),
    get: async (col, id) => clone(db[col].get(id)),
    insert: async (col, doc) => { db[col].set(doc.id, clone(doc)); return clone(doc); },
    update: async (col, id, patch) => {
      const cur = db[col].get(id);
      if (!cur) return null;
      const next = { ...cur, ...clone(patch) };
      db[col].set(id, next);
      return clone(next);
    },
    seq: async (name) => {
      const cur = db.counters.get(name) || { id: name, value: 0 };
      cur.value += 1;
      db.counters.set(name, cur);
      return cur.value;
    },
    async reseed() {
      for (const c of COLLECTIONS) db[c].clear();
      await load(store, await buildSeed());
    },
  };
  return store;
}

async function mongoStore(uri) {
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'smartresolve');
  const C = (name) => db.collection(name);
  const strip = (d) => { if (!d) return null; const { _id, ...rest } = d; return rest; };

  const store = {
    mode: 'mongodb',
    seededAt: null,
    all: async (col) => (await C(col).find({}).toArray()).map(strip),
    get: async (col, id) => strip(await C(col).findOne({ _id: id })),
    insert: async (col, doc) => { await C(col).insertOne({ _id: doc.id, ...doc }); return doc; },
    update: async (col, id, patch) => strip(await C(col).findOneAndUpdate({ _id: id }, { $set: patch }, { returnDocument: 'after' })),
    seq: async (name) => {
      const r = await C('counters').findOneAndUpdate({ _id: name }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' });
      return r.value;
    },
    async reseed() {
      await Promise.all(COLLECTIONS.map((c) => C(c).deleteMany({})));
      await load(store, await buildSeed(), (col, docs) => C(col).insertMany(docs.map((d) => ({ _id: d.id, ...d }))));
      await C('meta').updateOne({ _id: 'seed' }, { $set: { version: SEED_VERSION, at: new Date().toISOString() } }, { upsert: true });
    },
  };

  const meta = await C('meta').findOne({ _id: 'seed' });
  if (meta?.version !== SEED_VERSION) {
    try {
      await C('meta').insertOne({ _id: `lock-v${SEED_VERSION}`, at: new Date().toISOString() });
      await store.reseed();
    } catch (e) {
      if (e?.code !== 11000) throw e;
      // Another instance holds the lock and is seeding. Wait for it.
      for (let i = 0; i < 20; i++) {
        if ((await C('meta').findOne({ _id: 'seed' }))?.version === SEED_VERSION) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  return store;
}

async function load(store, seed, bulk) {
  for (const col of ['users', 'tickets', 'incidents', 'notifications']) {
    if (!seed[col].length) continue;
    if (bulk) await bulk(col, seed[col]);
    else for (const d of seed[col]) await store.insert(col, d);
  }
  for (const [name, value] of Object.entries(seed.counters)) {
    if (bulk) await bulk('counters', [{ id: name, value }]);
    else await store.insert('counters', { id: name, value });
  }
  store.seededAt = new Date().toISOString();
}

// Cached on globalThis so a warm serverless instance reuses one connection.
export function getStore() {
  if (!globalThis.__srStore) {
    const uri = process.env.MONGODB_URI;
    globalThis.__srStore = (async () => {
      if (uri) return mongoStore(uri);
      const s = memoryStore();
      await s.reseed();
      return s;
    })().catch((err) => { globalThis.__srStore = null; throw err; });
  }
  return globalThis.__srStore;
}
