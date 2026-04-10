/**
 * Mongoose In-Memory Mock
 * Replaces MongoDB connection with a full-featured in-memory store.
 * Supports all mongoose operations needed by LendSmart tests.
 */
const mongoose = require("mongoose");

const store = new Map(); // collectionName -> array of raw docs

function getCol(name) {
  if (!store.has(name)) store.set(name, []);
  return store.get(name);
}

function replacer(k, v) {
  if (v instanceof mongoose.Types.ObjectId) return { __oid: v.toString() };
  if (v instanceof Date) return { __date: v.toISOString() };
  if (Buffer.isBuffer(v)) return { __buf: v.toString("base64") };
  return v;
}

function revive(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj.__oid) return new mongoose.Types.ObjectId(obj.__oid);
  if (obj.__date) return new Date(obj.__date);
  if (obj.__buf) return Buffer.from(obj.__buf, "base64");
  if (Array.isArray(obj)) return obj.map(revive);
  if (
    typeof obj === "object" &&
    !(obj instanceof Date) &&
    !(obj instanceof mongoose.Types.ObjectId)
  ) {
    const r = {};
    for (const [k, v] of Object.entries(obj)) r[k] = revive(v);
    return r;
  }
  return obj;
}

function serialize(doc) {
  return JSON.parse(JSON.stringify(doc, replacer));
}

function matches(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [key, val] of Object.entries(filter)) {
    if (key === "$and") {
      if (!val.every((f) => matches(doc, f))) return false;
      continue;
    }
    if (key === "$or") {
      if (!val.some((f) => matches(doc, f))) return false;
      continue;
    }
    if (key === "$nor") {
      if (val.some((f) => matches(doc, f))) return false;
      continue;
    }
    if (key === "$expr") continue; // skip complex expressions

    const docVal = key.includes(".")
      ? key.split(".").reduce((o, k) => o?.[k], doc)
      : doc[key];

    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      !(val instanceof mongoose.Types.ObjectId) &&
      !(val instanceof Date) &&
      !(val instanceof RegExp) &&
      !val.__oid
    ) {
      for (const [op, opVal] of Object.entries(val)) {
        const dStr = String(docVal ?? "");
        if (op === "$eq") {
          if (!eq(docVal, opVal)) return false;
        } else if (op === "$ne") {
          if (eq(docVal, opVal)) return false;
        } else if (op === "$gt") {
          if (!(docVal > opVal)) return false;
        } else if (op === "$gte") {
          if (!(docVal >= opVal)) return false;
        } else if (op === "$lt") {
          if (!(docVal < opVal)) return false;
        } else if (op === "$lte") {
          if (!(docVal <= opVal)) return false;
        } else if (op === "$in") {
          if (!Array.isArray(opVal) || !opVal.some((v) => eq(docVal, v)))
            return false;
        } else if (op === "$nin") {
          if (Array.isArray(opVal) && opVal.some((v) => eq(docVal, v)))
            return false;
        } else if (op === "$exists") {
          if (opVal && docVal === undefined) return false;
          if (!opVal && docVal !== undefined) return false;
        } else if (op === "$regex") {
          const re =
            opVal instanceof RegExp
              ? opVal
              : new RegExp(opVal, val.$options || "");
          if (!re.test(String(docVal ?? ""))) return false;
        } else if (op === "$elemMatch") {
          if (!Array.isArray(docVal) || !docVal.some((e) => matches(e, opVal)))
            return false;
        } else if (op === "$not") {
          if (matches({ [key]: docVal }, { [key]: opVal })) return false;
        } else if (op === "$size") {
          if (!Array.isArray(docVal) || docVal.length !== opVal) return false;
        }
      }
    } else if (val instanceof RegExp) {
      if (!val.test(String(docVal ?? ""))) return false;
    } else {
      if (!eq(docVal, val)) {
        if (val === null && (docVal === undefined || docVal === null)) continue;
        return false;
      }
    }
  }
  return true;
}

function eq(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  const aStr =
    a instanceof mongoose.Types.ObjectId || (a && a.__oid)
      ? String(a)
      : String(a ?? "");
  const bStr =
    b instanceof mongoose.Types.ObjectId || (b && b.__oid)
      ? String(b)
      : String(b ?? "");
  return aStr === bStr;
}

function applyUpdate(doc, upd) {
  if (!upd) return doc;
  // Check if it's a replacement (no $ operators at top level)
  const keys = Object.keys(upd);
  if (keys.length > 0 && !keys[0].startsWith("$")) {
    const id = doc._id;
    Object.keys(doc).forEach((k) => k !== "_id" && delete doc[k]);
    Object.assign(doc, { _id: id, ...upd });
    return doc;
  }
  if (upd.$set) Object.assign(doc, upd.$set);
  if (upd.$unset) Object.keys(upd.$unset).forEach((k) => delete doc[k]);
  if (upd.$inc)
    Object.entries(upd.$inc).forEach(([k, v]) => {
      doc[k] = (doc[k] || 0) + v;
    });
  if (upd.$push) {
    Object.entries(upd.$push).forEach(([k, v]) => {
      if (!Array.isArray(doc[k])) doc[k] = [];
      const vals = v && v.$each ? v.$each : [v];
      doc[k].push(...vals);
      if (v && v.$slice) doc[k] = doc[k].slice(v.$slice);
    });
  }
  if (upd.$pull) {
    Object.entries(upd.$pull).forEach(([k, v]) => {
      if (Array.isArray(doc[k]))
        doc[k] = doc[k].filter((e) => !eq(e, v) && !matches(e, v));
    });
  }
  if (upd.$addToSet) {
    Object.entries(upd.$addToSet).forEach(([k, v]) => {
      if (!Array.isArray(doc[k])) doc[k] = [];
      const vals = v && v.$each ? v.$each : [v];
      vals.forEach((val) => {
        if (!doc[k].some((e) => eq(e, val))) doc[k].push(val);
      });
    });
  }
  if (upd.$currentDate) {
    Object.keys(upd.$currentDate).forEach((k) => (doc[k] = new Date()));
  }
  return doc;
}

function sortDocs(docs, sort) {
  if (!sort || Object.keys(sort).length === 0) return docs;
  return [...docs].sort((a, b) => {
    for (const [key, dir] of Object.entries(sort)) {
      const av = key.includes(".")
        ? key.split(".").reduce((o, k) => o?.[k], a)
        : a[key];
      const bv = key.includes(".")
        ? key.split(".").reduce((o, k) => o?.[k], b)
        : b[key];
      if (av == null && bv != null) return dir;
      if (av != null && bv == null) return -dir;
      if (av < bv) return -dir;
      if (av > bv) return dir;
    }
    return 0;
  });
}

function applyProjection(doc, proj) {
  if (!proj || Object.keys(proj).length === 0) return { ...doc };
  const hasIncludes = Object.values(proj).some((v) => v === 1);
  const result = hasIncludes ? { _id: doc._id } : { ...doc };
  for (const [k, v] of Object.entries(proj)) {
    if (v === 1) result[k] = doc[k];
    if (v === 0) delete result[k];
  }
  return result;
}

function runAggregate(colName, pipeline) {
  let results = getCol(colName).map(revive);
  for (const stage of pipeline || []) {
    const key = Object.keys(stage)[0];
    const val = stage[key];
    if (key === "$match") results = results.filter((d) => matches(d, val));
    else if (key === "$limit") results = results.slice(0, val);
    else if (key === "$skip") results = results.slice(val);
    else if (key === "$sort") results = sortDocs(results, val);
    else if (key === "$count") results = [{ [val]: results.length }];
    else if (key === "$project")
      results = results.map((d) => applyProjection(d, val));
    else if (key === "$group") {
      const groups = new Map();
      for (const doc of results) {
        const idExpr = val._id;
        const groupId =
          idExpr === null
            ? null
            : typeof idExpr === "string" && idExpr.startsWith("$")
              ? doc[idExpr.slice(1)]
              : idExpr;
        const k = JSON.stringify(groupId);
        if (!groups.has(k)) {
          const g = { _id: groupId };
          for (const [f, e] of Object.entries(val)) {
            if (f === "_id") continue;
            if (e.$sum !== undefined) g[f] = 0;
            else if (e.$count !== undefined) g[f] = 0;
            else if (e.$push !== undefined) g[f] = [];
            else if (e.$first !== undefined) g[f] = undefined;
            else if (e.$last !== undefined) g[f] = undefined;
            else if (e.$avg !== undefined) g[f] = { sum: 0, count: 0 };
          }
          groups.set(k, g);
        }
        const g = groups.get(k);
        for (const [f, e] of Object.entries(val)) {
          if (f === "_id") continue;
          if (e.$sum !== undefined) {
            const v2 =
              e.$sum === 1
                ? 1
                : typeof e.$sum === "string" && e.$sum.startsWith("$")
                  ? doc[e.$sum.slice(1)]
                  : e.$sum;
            g[f] = (g[f] || 0) + (Number(v2) || 0);
          } else if (e.$count !== undefined) g[f] = (g[f] || 0) + 1;
          else if (e.$push !== undefined) {
            const v2 =
              typeof e.$push === "string" && e.$push.startsWith("$")
                ? doc[e.$push.slice(1)]
                : e.$push;
            g[f].push(v2);
          } else if (e.$first !== undefined && g[f] === undefined) {
            g[f] =
              typeof e.$first === "string" && e.$first.startsWith("$")
                ? doc[e.$first.slice(1)]
                : e.$first;
          } else if (e.$last !== undefined) {
            g[f] =
              typeof e.$last === "string" && e.$last.startsWith("$")
                ? doc[e.$last.slice(1)]
                : e.$last;
          } else if (e.$avg !== undefined) {
            const v2 =
              typeof e.$avg === "string" && e.$avg.startsWith("$")
                ? doc[e.$avg.slice(1)]
                : 0;
            g[f].sum += Number(v2) || 0;
            g[f].count++;
          }
        }
      }
      results = [...groups.values()].map((g) => {
        for (const [k, v] of Object.entries(g))
          if (v && v.sum !== undefined)
            g[k] = v.count > 0 ? v.sum / v.count : 0;
        return g;
      });
    } else if (key === "$unwind") {
      const field = (val.path || val).replace(/^\$/, "");
      const newR = [];
      for (const doc of results) {
        const arr = doc[field];
        if (Array.isArray(arr))
          arr.forEach((v) => newR.push({ ...doc, [field]: v }));
        else if (arr != null) newR.push(doc);
        else if (val.preserveNullAndEmptyArrays) newR.push(doc);
      }
      results = newR;
    }
  }
  return results;
}

const collectionCache = new Map();

function makeMockCollection(name) {
  if (collectionCache.has(name)) return collectionCache.get(name);
  return {
    collectionName: name,
    insertOne: async (doc) => {
      if (!doc._id) doc._id = new mongoose.Types.ObjectId();
      getCol(name).push(serialize(doc));
      return { insertedId: doc._id, acknowledged: true };
    },
    insertMany: async (docs) => {
      docs.forEach((d) => {
        if (!d._id) d._id = new mongoose.Types.ObjectId();
        getCol(name).push(serialize(d));
      });
      return { insertedCount: docs.length, acknowledged: true };
    },
    findOne: async (filter, opts) => {
      const proj = opts?.projection;
      const doc = getCol(name)
        .map(revive)
        .find((d) => matches(d, filter));
      return doc ? (proj ? applyProjection(doc, proj) : doc) : null;
    },
    find: (filter, opts) => {
      let _sort = null,
        _skip = 0,
        _limit = 0,
        _proj = opts?.projection;
      const cursor = {
        sort: (s) => {
          _sort = s;
          return cursor;
        },
        skip: (n) => {
          _skip = n;
          return cursor;
        },
        limit: (n) => {
          _limit = n;
          return cursor;
        },
        lean: () => cursor,
        select: (p) => {
          _proj = p;
          return cursor;
        },
        populate: () => cursor,
        toArray: async () => {
          let r = getCol(name)
            .map(revive)
            .filter((d) => matches(d, filter));
          if (_sort) r = sortDocs(r, _sort);
          if (_skip) r = r.slice(_skip);
          if (_limit) r = r.slice(0, _limit);
          if (_proj) r = r.map((d) => applyProjection(d, _proj));
          return r;
        },
      };
      // NOTE: Do NOT make cursor thenable (.then) because query.js does
      // `const cursor = await collection.find()` and expects a cursor back,
      // not the resolved array. If .then is present, await resolves it to
      // the array and then cursor.toArray() fails on the array.
      return cursor;
    },
    updateOne: async (filter, upd, opts) => {
      const col = getCol(name);
      const raw = col.find((d) => matches(revive(d), filter));
      if (raw) {
        applyUpdate(raw, upd);
        return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
      }
      if (opts?.upsert) {
        const nd = serialize({ _id: new mongoose.Types.ObjectId() });
        applyUpdate(nd, upd);
        col.push(nd);
        return {
          matchedCount: 0,
          modifiedCount: 0,
          upsertedId: nd._id,
          acknowledged: true,
        };
      }
      return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
    },
    updateMany: async (filter, upd) => {
      let n = 0;
      getCol(name).forEach((d) => {
        if (matches(revive(d), filter)) {
          applyUpdate(d, upd);
          n++;
        }
      });
      return { matchedCount: n, modifiedCount: n, acknowledged: true };
    },
    deleteOne: async (filter) => {
      const col = getCol(name);
      const idx = col.findIndex((d) => matches(revive(d), filter));
      if (idx >= 0) {
        col.splice(idx, 1);
        return { deletedCount: 1, acknowledged: true };
      }
      return { deletedCount: 0, acknowledged: true };
    },
    deleteMany: async (filter) => {
      const col = getCol(name);
      const remaining = col.filter((d) => !matches(revive(d), filter));
      const n = col.length - remaining.length;
      store.set(name, remaining);
      return { deletedCount: n, acknowledged: true };
    },
    replaceOne: async (filter, doc) => {
      const col = getCol(name);
      const idx = col.findIndex((d) => matches(revive(d), filter));
      if (idx >= 0) {
        const id = col[idx]._id || col[idx].__oid;
        col[idx] = serialize({ ...doc, _id: id });
        return { matchedCount: 1, modifiedCount: 1 };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    },
    findOneAndUpdate: async (filter, upd, opts) => {
      const col = getCol(name);
      const idx = col.findIndex((d) => matches(revive(d), filter));
      if (idx >= 0) {
        const before = revive(col[idx]);
        applyUpdate(col[idx], upd);
        return opts?.returnDocument === "after" ? revive(col[idx]) : before;
      }
      if (opts?.upsert) {
        const nd = { _id: new mongoose.Types.ObjectId() };
        applyUpdate(nd, upd);
        col.push(serialize(nd));
        return nd;
      }
      return null;
    },
    findOneAndDelete: async (filter) => {
      const col = getCol(name);
      const idx = col.findIndex((d) => matches(revive(d), filter));
      if (idx >= 0) {
        const doc = revive(col[idx]);
        col.splice(idx, 1);
        return doc;
      }
      return null;
    },
    countDocuments: async (filter) =>
      getCol(name).filter((d) => matches(revive(d), filter || {})).length,
    estimatedDocumentCount: async () => getCol(name).length,
    aggregate: (pipeline) => ({
      toArray: async () => runAggregate(name, pipeline),
    }),
    distinct: async (field, filter) => [
      ...new Set(
        getCol(name)
          .filter((d) => !filter || matches(revive(d), filter))
          .map((d) => revive(d)[field])
          .filter((v) => v !== undefined),
      ),
    ],
    bulkWrite: async (ops) => {
      let inserted = 0,
        updated = 0,
        deleted = 0;
      for (const op of ops) {
        if (op.insertOne) {
          const d = op.insertOne.document;
          if (!d._id) d._id = new mongoose.Types.ObjectId();
          getCol(name).push(serialize(d));
          inserted++;
        } else if (op.updateOne) {
          const col = getCol(name);
          const raw = col.find((d) => matches(revive(d), op.updateOne.filter));
          if (raw) {
            applyUpdate(raw, op.updateOne.update);
            updated++;
          }
        } else if (op.deleteOne) {
          const col = getCol(name);
          const idx = col.findIndex((d) =>
            matches(revive(d), op.deleteOne.filter),
          );
          if (idx >= 0) {
            col.splice(idx, 1);
            deleted++;
          }
        }
      }
      return {
        insertedCount: inserted,
        modifiedCount: updated,
        deletedCount: deleted,
        ok: 1,
      };
    },
    createIndex: async () => ({}),
    createIndexes: async () => [],
    dropIndexes: async () => true,
    ensureIndex: async () => ({}),
    listIndexes: () => ({ toArray: async () => [] }),
    drop: async () => {
      store.delete(name);
      return true;
    },
    rename: async () => ({}),
  };
  collectionCache.set(name, col);
  return col;
}

function clearAll() {
  store.clear();
}

function clearCollection(name) {
  store.delete(name);
}

function installMock() {
  const mockDb = {
    collection: (name) => makeMockCollection(name),
    databaseName: "test",
    command: async () => ({ ok: 1 }),
    collections: async () =>
      [...store.keys()].map((name) => makeMockCollection(name)),
    listCollections: () => ({
      toArray: async () => [...store.keys()].map((name) => ({ name })),
    }),
    dropCollection: async (name) => {
      store.delete(name);
      return true;
    },
    dropDatabase: async () => {
      store.clear();
      return true;
    },
    stats: async () => ({}),
  };

  // Set db BEFORE calling onOpen so collections resolve correctly
  mongoose.connection.db = mockDb;
  mongoose.connection.client = { db: () => mockDb, close: async () => {} };
  mongoose.connection.host = "localhost";
  mongoose.connection.port = 27017;
  mongoose.connection.name = "test";

  // Trigger full connection open sequence: sets readyState=1, flushes queue,
  // calls onOpen() on all registered collections, emits 'open'
  mongoose.connection.onOpen();

  // Patch NativeCollection._getCollection so any collection registered AFTER
  // installMock (e.g. models defined later) also gets the mock db
  try {
    const NativeCollection = require("mongoose/lib/drivers/node-mongodb-native/collection");
    NativeCollection.prototype._getCollection = function () {
      if (!this.collection) {
        this.collection = mockDb.collection(this.name);
      }
      return this.collection;
    };
    const MongooseCollection = require("mongoose/lib/collection");
    NativeCollection.prototype.onOpen = function () {
      this.collection = mockDb.collection(this.name);
      // Call parent onOpen: sets this.buffer=false and flushes the queue
      MongooseCollection.prototype.onOpen.call(this);
      return this.collection;
    };
  } catch (e) {
    // ignore if not available
  }

  // Override mongoose.connect so tests that call it explicitly still work
  mongoose.connect = async function () {
    mongoose.connection.db = mockDb;
    mongoose.connection.onOpen();
    return mongoose;
  };

  mongoose.connection.openUri = async function () {
    this.db = mockDb;
    this.onOpen();
    return this;
  };

  mongoose.disconnect = async function () {
    mongoose.connection.readyState = 0;
    return mongoose;
  };

  // Also patch mongoose.connection.close
  mongoose.connection.close = async function () {
    mongoose.connection.readyState = 0;
    return mongoose.connection;
  };

  return { clearAll, clearCollection, store, mockDb };
}

module.exports = { installMock, clearAll, clearCollection, store };
