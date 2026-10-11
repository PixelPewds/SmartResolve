// Data layer. Two implementations behind one interface:
//
//   MONGODB_URI set   -> MongoDB (Atlas in production)
//   MONGODB_URI unset -> in-process memory, seeded on boot
//
// Memory mode exists so the prototype runs with zero setup. On Vercel each
// serverless instance has its own memory, so tickets created there are not
// shared or durable. Set MONGODB_URI for anything beyond a solo demo.

import { MongoClient } from 'mongodb';
import { buildSeed } from './seed.js';

const strip = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
};

function memoryStore(seed) {
  const users = new Map(seed.users.map((u) => [u.id, u]));
  const tickets = new Map(seed.tickets.map((t) => [t.id, t]));
  let counter = seed.nextNumber;
  const clone = (x) => (x ? structuredClone(x) : null);

  return {
    mode: 'memory',
    users: {
      findByEmail: async (email) => clone([...users.values()].find((u) => u.email === email)),
      findById: async (id) => clone(users.get(id)),
      insert: async (u) => { users.set(u.id, u); return clone(u); },
    },
    tickets: {
      insert: async (t) => { tickets.set(t.id, t); return clone(t); },
      get: async (id) => clone(tickets.get(id)),
      update: async (id, patch) => {
        const cur = tickets.get(id);
        if (!cur) return null;
        const next = { ...cur, ...patch };
        tickets.set(id, next);
        return clone(next);
      },
      list: async ({ customerId } = {}) =>
        [...tickets.values()].filter((t) => !customerId || t.customerId === customerId).map(clone),
      countSince: async ({ customerId, since }) =>
        [...tickets.values()].filter((t) => t.customerId === customerId && t.createdAt >= since).length,
    },
    nextTicketNumber: async () => counter++,
  };
}

async function mongoStore(uri) {
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'smartresolve');
  const Users = db.collection('users');
  const Tickets = db.collection('tickets');
  const Counters = db.collection('counters');

  await Promise.all([
    Users.createIndex({ email: 1 }, { unique: true }),
    Tickets.createIndex({ customerId: 1, createdAt: -1 }),
    Tickets.createIndex({ 'priority.score': -1 }),
  ]);

  // Seed exactly once. Concurrent cold starts race here, so the insert of the
  // lock document is the gate: only the instance that wins it seeds.
  if ((await Tickets.estimatedDocumentCount()) === 0) {
    try {
      await Counters.insertOne({ _id: 'seed-lock', at: new Date().toISOString() });
      const seed = await buildSeed();
      await Users.insertMany(seed.users.map((u) => ({ _id: u.id, ...u })), { ordered: false }).catch(() => {});
      await Tickets.insertMany(seed.tickets.map((t) => ({ _id: t.id, ...t })));
      await Counters.updateOne({ _id: 'ticket' }, { $set: { seq: seed.nextNumber } }, { upsert: true });
    } catch (e) {
      if (e?.code !== 11000) throw e; // 11000 = another instance already seeded
    }
  }

  return {
    mode: 'mongodb',
    users: {
      findByEmail: async (email) => strip(await Users.findOne({ email })),
      findById: async (id) => strip(await Users.findOne({ _id: id })),
      insert: async (u) => { await Users.insertOne({ _id: u.id, ...u }); return u; },
    },
    tickets: {
      insert: async (t) => { await Tickets.insertOne({ _id: t.id, ...t }); return t; },
      get: async (id) => strip(await Tickets.findOne({ _id: id })),
      update: async (id, patch) =>
        strip(await Tickets.findOneAndUpdate({ _id: id }, { $set: patch }, { returnDocument: 'after' })),
      list: async ({ customerId } = {}) =>
        (await Tickets.find(customerId ? { customerId } : {}).sort({ createdAt: -1 }).limit(2000).toArray()).map(strip),
      countSince: async ({ customerId, since }) => Tickets.countDocuments({ customerId, createdAt: { $gte: since } }),
    },
    nextTicketNumber: async () => {
      const r = await Counters.findOneAndUpdate({ _id: 'ticket' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'before' });
      return r?.seq ?? 1001;
    },
  };
}

// Cached on globalThis so a warm serverless instance reuses one connection
// instead of opening a new pool per request.
export function getStore() {
  if (!globalThis.__srStore) {
    const uri = process.env.MONGODB_URI;
    globalThis.__srStore = (uri ? mongoStore(uri) : buildSeed().then(memoryStore)).catch((err) => {
      globalThis.__srStore = null; // let the next request retry instead of caching the failure
      throw err;
    });
  }
  return globalThis.__srStore;
}
