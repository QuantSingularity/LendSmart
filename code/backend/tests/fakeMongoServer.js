/**
 * Fake MongoDB Server - Complete In-Memory Implementation
 * Uses proper BSON encoding for MongoDB wire protocol
 */
"use strict";
const net = require("net");
const crypto = require("crypto");

// ─── Minimal BSON ────────────────────────────────────────────────────────────

function genOid() {
  return crypto.randomBytes(12).toString("hex");
}

function encodeStr(s) {
  const b = Buffer.from((s || "") + "\0", "utf8");
  const l = Buffer.allocUnsafe(4);
  l.writeInt32LE(b.length, 0);
  return Buffer.concat([l, b]);
}
function encodeKey(k) {
  return Buffer.from(k + "\0", "utf8");
}

function encodeBSON(val) {
  if (Array.isArray(val)) {
    const obj = {};
    val.forEach((v, i) => {
      obj[String(i)] = v;
    });
    return encodeBSON(obj);
  }
  if (val === null || val === undefined || typeof val !== "object") {
    val = {};
  }
  const parts = [];
  for (const [k, v] of Object.entries(val)) {
    const kb = encodeKey(k);
    if (v === null || v === undefined) {
      parts.push(Buffer.concat([Buffer.from([0x0a]), kb]));
    } else if (typeof v === "boolean") {
      parts.push(
        Buffer.concat([Buffer.from([0x08]), kb, Buffer.from([v ? 1 : 0])]),
      );
    } else if (v instanceof Date) {
      const b = Buffer.allocUnsafe(8);
      b.writeBigInt64LE(BigInt(v.getTime()), 0);
      parts.push(Buffer.concat([Buffer.from([0x09]), kb, b]));
    } else if (typeof v === "object" && v.__oid) {
      const hex = String(v.__oid).padEnd(24, "0").slice(0, 24);
      parts.push(
        Buffer.concat([Buffer.from([0x07]), kb, Buffer.from(hex, "hex")]),
      );
    } else if (Buffer.isBuffer(v)) {
      const lb = Buffer.allocUnsafe(4);
      lb.writeInt32LE(v.length, 0);
      parts.push(
        Buffer.concat([Buffer.from([0x05]), kb, lb, Buffer.from([0x00]), v]),
      );
    } else if (Array.isArray(v) || typeof v === "object") {
      const sub = encodeBSON(v);
      const type = Array.isArray(v) ? 0x04 : 0x03;
      parts.push(Buffer.concat([Buffer.from([type]), kb, sub]));
    } else if (typeof v === "number") {
      if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) {
        const b = Buffer.allocUnsafe(4);
        b.writeInt32LE(v, 0);
        parts.push(Buffer.concat([Buffer.from([0x10]), kb, b]));
      } else {
        const b = Buffer.allocUnsafe(8);
        b.writeDoubleBE(v, 0);
        parts.push(Buffer.concat([Buffer.from([0x01]), kb, b]));
      }
    } else if (typeof v === "string") {
      parts.push(Buffer.concat([Buffer.from([0x02]), kb, encodeStr(v)]));
    }
  }
  const body = Buffer.concat(parts);
  const buf = Buffer.allocUnsafe(4 + body.length + 1);
  buf.writeInt32LE(buf.length, 0);
  body.copy(buf, 4);
  buf[buf.length - 1] = 0;
  return buf;
}

function decodeBSON(buf, off = 0) {
  const docSize = buf.readInt32LE(off);
  const obj = {};
  let pos = off + 4;
  const end = off + docSize - 1;
  while (pos < end && pos < buf.length) {
    const type = buf[pos++];
    if (type === 0) break;
    let ke = pos;
    while (ke < buf.length && buf[ke] !== 0) ke++;
    const key = buf.slice(pos, ke).toString("utf8");
    pos = ke + 1;
    if (pos > buf.length) break;
    switch (type) {
      case 0x01:
        obj[key] = buf.readDoubleBE(pos);
        pos += 8;
        break;
      case 0x02: {
        const l = buf.readInt32LE(pos);
        pos += 4;
        obj[key] = buf.slice(pos, pos + l - 1).toString("utf8");
        pos += l;
        break;
      }
      case 0x03: {
        const s = buf.readInt32LE(pos);
        obj[key] = decodeBSON(buf, pos);
        pos += s;
        break;
      }
      case 0x04: {
        const s = buf.readInt32LE(pos);
        const sub = decodeBSON(buf, pos);
        pos += s;
        obj[key] = Object.keys(sub)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => sub[k]);
        break;
      }
      case 0x05: {
        const bl = buf.readInt32LE(pos);
        pos += 5;
        obj[key] = buf.slice(pos, pos + bl);
        pos += bl;
        break;
      }
      case 0x07: {
        obj[key] = { __oid: buf.slice(pos, pos + 12).toString("hex") };
        pos += 12;
        break;
      }
      case 0x08:
        obj[key] = buf[pos++] !== 0;
        break;
      case 0x09: {
        obj[key] = new Date(Number(buf.readBigInt64LE(pos)));
        pos += 8;
        break;
      }
      case 0x0a:
        obj[key] = null;
        break;
      case 0x0b: {
        let pe = pos;
        while (buf[pe] !== 0) pe++;
        const pat = buf.slice(pos, pe).toString();
        pos = pe + 1;
        let fe = pos;
        while (buf[fe] !== 0) fe++;
        const fl = buf.slice(pos, fe).toString();
        pos = fe + 1;
        try {
          obj[key] = new RegExp(pat, fl);
        } catch (e) {
          obj[key] = null;
        }
        break;
      }
      case 0x10:
        obj[key] = buf.readInt32LE(pos);
        pos += 4;
        break;
      case 0x11:
      case 0x12: {
        obj[key] = Number(buf.readBigInt64LE(pos));
        pos += 8;
        break;
      }
      case 0x13: {
        obj[key] = 0;
        pos += 16;
        break;
      }
      default:
        pos = end;
        break;
    }
  }
  return obj;
}

// ─── In-Memory Storage ────────────────────────────────────────────────────────

const store = new Map(); // dbName -> Map<colName -> Array<doc>>

function col(db, name) {
  if (!store.has(db)) store.set(db, new Map());
  const d = store.get(db);
  if (!d.has(name)) d.set(name, []);
  return d.get(name);
}

function oidStr(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v.__oid) return v.__oid;
  return String(v);
}

function deepEq(a, b) {
  if (a === b) return true;
  if (oidStr(a) && oidStr(b) && oidStr(a) === oidStr(b)) return true;
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (a instanceof Date && typeof b === "string") return a.toISOString() === b;
  if (typeof b === "string" && a && a.__oid) return a.__oid === b;
  if (typeof a === "string" && b && b.__oid) return a === b.__oid;
  return false;
}

function getPath(doc, path) {
  const parts = path.split(".");
  let cur = doc;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function matches(doc, filter) {
  if (!filter) return true;
  for (const [k, v] of Object.entries(filter)) {
    if (k === "$and") {
      if (!v.every((f) => matches(doc, f))) return false;
      continue;
    }
    if (k === "$or") {
      if (!v.some((f) => matches(doc, f))) return false;
      continue;
    }
    if (k === "$nor") {
      if (v.some((f) => matches(doc, f))) return false;
      continue;
    }
    if (k === "$where") continue; // skip

    const dv = k.includes(".") ? getPath(doc, k) : doc[k];

    if (v instanceof RegExp) {
      if (!v.test(String(dv ?? ""))) return false;
      continue;
    }

    if (
      v !== null &&
      typeof v === "object" &&
      !v.__oid &&
      !(v instanceof Date) &&
      !(v instanceof RegExp) &&
      !Array.isArray(v)
    ) {
      const ops = Object.keys(v).filter((k) => k.startsWith("$"));
      if (ops.length > 0) {
        for (const op of ops) {
          const ov = v[op];
          if (op === "$eq") {
            if (!deepEq(dv, ov) && dv !== ov) return false;
          } else if (op === "$ne") {
            if (deepEq(dv, ov) || dv === ov) return false;
          } else if (op === "$gt") {
            if (!(dv > ov)) return false;
          } else if (op === "$gte") {
            if (!(dv >= ov)) return false;
          } else if (op === "$lt") {
            if (!(dv < ov)) return false;
          } else if (op === "$lte") {
            if (!(dv <= ov)) return false;
          } else if (op === "$in") {
            if (!Array.isArray(ov)) return false;
            if (!ov.some((x) => deepEq(dv, x) || dv === x)) return false;
          } else if (op === "$nin") {
            if (Array.isArray(ov) && ov.some((x) => deepEq(dv, x) || dv === x))
              return false;
          } else if (op === "$exists") {
            if (ov && dv === undefined) return false;
            if (!ov && dv !== undefined) return false;
          } else if (op === "$regex") {
            const re =
              ov instanceof RegExp ? ov : new RegExp(ov, v.$options || "");
            if (!re.test(String(dv ?? ""))) return false;
          } else if (op === "$elemMatch") {
            if (!Array.isArray(dv) || !dv.some((e) => matches(e, ov)))
              return false;
          } else if (op === "$size") {
            if (!Array.isArray(dv) || dv.length !== ov) return false;
          } else if (op === "$not") {
            if (matches({ [k]: dv }, { [k]: ov })) return false;
          } else if (op === "$all") {
            if (!Array.isArray(dv)) return false;
            if (!ov.every((x) => dv.some((d) => deepEq(d, x) || d === x)))
              return false;
          }
        }
        continue;
      }
    }
    // Direct equality
    if (dv !== v && !deepEq(dv, v)) return false;
  }
  return true;
}

function applyUp(doc, upd) {
  if (!upd || typeof upd !== "object") return doc;
  const hasOp = Object.keys(upd).some((k) => k.startsWith("$"));
  if (!hasOp) {
    // replacement
    return { _id: doc._id, ...upd };
  }
  const r = JSON.parse(JSON.stringify(doc));
  for (const [op, fields] of Object.entries(upd)) {
    if (!fields || typeof fields !== "object") continue;
    if (op === "$set") {
      for (const [k, v] of Object.entries(fields)) setPath(r, k, v);
    } else if (op === "$unset") {
      for (const k of Object.keys(fields)) deletePath(r, k);
    } else if (op === "$inc") {
      for (const [k, v] of Object.entries(fields))
        setPath(r, k, (getPath(r, k) || 0) + v);
    } else if (op === "$push") {
      for (const [k, v] of Object.entries(fields)) {
        let arr = getPath(r, k);
        if (!Array.isArray(arr)) {
          setPath(r, k, []);
          arr = getPath(r, k);
        }
        if (v && typeof v === "object" && v.$each) arr.push(...v.$each);
        else arr.push(v);
        if (v && v.$slice !== undefined)
          setPath(
            r,
            k,
            arr.slice(0, v.$slice < 0 ? arr.length + v.$slice : v.$slice),
          );
      }
    } else if (op === "$pull") {
      for (const [k, v] of Object.entries(fields)) {
        const arr = getPath(r, k);
        if (Array.isArray(arr))
          setPath(
            r,
            k,
            arr.filter(
              (e) => !matches(e, typeof v === "object" ? v : { $eq: v }),
            ),
          );
      }
    } else if (op === "$addToSet") {
      for (const [k, v] of Object.entries(fields)) {
        let arr = getPath(r, k);
        if (!Array.isArray(arr)) {
          setPath(r, k, []);
          arr = getPath(r, k);
        }
        const items = v && v.$each ? v.$each : [v];
        for (const item of items) {
          if (!arr.some((e) => deepEq(e, item) || e === item)) arr.push(item);
        }
      }
    } else if (op === "$currentDate") {
      for (const k of Object.keys(fields)) setPath(r, k, new Date());
    }
  }
  return r;
}

function setPath(obj, path, val) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

function deletePath(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur[parts[i]];
    if (!cur) return;
  }
  delete cur[parts[parts.length - 1]];
}

function doSort(docs, sort) {
  if (!sort) return docs;
  return [...docs].sort((a, b) => {
    for (const [k, d] of Object.entries(sort)) {
      const av = getPath(a, k),
        bv = getPath(b, k);
      if (av < bv || av === undefined) return -d;
      if (av > bv || bv === undefined) return d;
    }
    return 0;
  });
}

function doProject(doc, proj) {
  if (!proj || Object.keys(proj).length === 0) return doc;
  const inc = Object.values(proj).some((v) => v === 1);
  const r = {};
  if (inc) {
    r._id = doc._id;
    for (const [k, v] of Object.entries(proj)) {
      if (v === 1) r[k] = doc[k];
      if (k === "_id" && v === 0) delete r._id;
    }
  } else {
    Object.assign(r, doc);
    for (const [k, v] of Object.entries(proj)) {
      if (v === 0) delete r[k];
    }
  }
  return r;
}

// ─── Command Dispatch ─────────────────────────────────────────────────────────

function handle(doc, dbName) {
  const cmd = (Object.keys(doc)[0] || "").toLowerCase();

  const hello = {
    ismaster: true,
    isMaster: true,
    ok: 1,
    maxBsonObjectSize: 16777216,
    maxMessageSizeBytes: 48000000,
    maxWriteBatchSize: 100000,
    minWireVersion: 0,
    maxWireVersion: 21,
    readOnly: false,
    connectionId: 1,
    localTime: new Date(),
  };

  if (["ismaster", "hello", "_isonmaster"].includes(cmd)) return hello;
  if (cmd === "buildinfo" || cmd === "buildInfo")
    return { version: "6.0.0", ok: 1 };
  if (cmd === "getparameter")
    return { featureCompatibilityVersion: { version: "6.0" }, ok: 1 };
  if (cmd === "ping") return { ok: 1 };
  if (cmd === "listdatabases")
    return {
      databases: [...store.keys()].map((n) => ({ name: n, sizeOnDisk: 0 })),
      ok: 1,
    };
  if (cmd === "listcollections") {
    const db = store.get(dbName) || new Map();
    return {
      cursor: {
        id: 0,
        ns: `${dbName}.$cmd`,
        firstBatch: [...db.keys()].map((n) => ({
          name: n,
          type: "collection",
          options: {},
          idIndex: { v: 2, key: { _id: 1 }, name: "_id_" },
        })),
      },
      ok: 1,
    };
  }
  if (
    [
      "create",
      "createindexes",
      "dropindexes",
      "collmod",
      "endsessions",
      "logout",
      "drop",
      "dropcollection",
      "saslstart",
      "saslcontinue",
      "getnonce",
      "authenticate",
      "setfeaturecompatibilityversion",
      "serverselectiontest",
    ].includes(cmd)
  )
    return { ok: 1 };
  if (cmd === "dropdatabase") {
    store.delete(dbName);
    return { ok: 1, dropped: dbName };
  }

  const colName = doc[Object.keys(doc)[0]];

  if (cmd === "insert") {
    const c = col(dbName, colName);
    const docs = doc.documents || [];
    for (const d of docs) {
      if (!d._id) d._id = { __oid: genOid() };
      c.push(d);
    }
    return { n: docs.length, ok: 1 };
  }

  if (cmd === "find") {
    const c = col(dbName, colName);
    const filt = doc.filter || {};
    const proj = doc.projection;
    const sort = doc.sort;
    const skip = doc.skip || 0;
    const limit = doc.limit || 0;
    let res = c.filter((d) => matches(d, filt));
    if (sort) res = doSort(res, sort);
    if (skip) res = res.slice(skip);
    if (limit > 0) res = res.slice(0, limit);
    if (proj) res = res.map((d) => doProject(d, proj));
    return {
      cursor: { id: 0, ns: `${dbName}.${colName}`, firstBatch: res },
      ok: 1,
    };
  }

  if (cmd === "update") {
    const c = col(dbName, colName);
    const updates = doc.updates || [];
    let n = 0,
      nMod = 0;
    const upserted = [];
    for (const u of updates) {
      const filt = u.q || {},
        upd = u.u || {},
        multi = u.multi,
        upsert = u.upsert;
      const idxs = [];
      for (let i = 0; i < c.length; i++) {
        if (matches(c[i], filt)) {
          idxs.push(i);
          if (!multi) break;
        }
      }
      if (idxs.length === 0 && upsert) {
        const nd = applyUp({ _id: { __oid: genOid() } }, upd);
        c.push(nd);
        upserted.push({ index: 0, _id: nd._id });
        n++;
      } else {
        for (const i of idxs) {
          c[i] = applyUp(c[i], upd);
          nMod++;
          n++;
        }
      }
    }
    return { n, nModified: nMod, ok: 1, ...(upserted.length && { upserted }) };
  }

  if (cmd === "delete") {
    const c = col(dbName, colName);
    const dels = doc.deletes || [];
    let n = 0;
    for (const d of dels) {
      const filt = d.q || {},
        lim = d.limit;
      for (let i = c.length - 1; i >= 0; i--) {
        if (matches(c[i], filt)) {
          c.splice(i, 1);
          n++;
          if (lim === 1) break;
        }
      }
    }
    return { n, ok: 1 };
  }

  if (cmd === "findandmodify") {
    const c = col(dbName, colName);
    const filt = doc.query || {},
      upd = doc.update,
      rm = doc.remove,
      ret = doc["new"],
      upsert = doc.upsert;
    const i = c.findIndex((d) => matches(d, filt));
    if (i < 0) {
      if (upsert && upd) {
        const nd = applyUp({ _id: { __oid: genOid() } }, upd);
        c.push(nd);
        return {
          lastErrorObject: { n: 1, upserted: nd._id, updatedExisting: false },
          value: ret ? nd : null,
          ok: 1,
        };
      }
      return {
        lastErrorObject: { n: 0, updatedExisting: false },
        value: null,
        ok: 1,
      };
    }
    const before = JSON.parse(JSON.stringify(c[i]));
    if (rm) {
      c.splice(i, 1);
      return { lastErrorObject: { n: 1 }, value: before, ok: 1 };
    }
    c[i] = applyUp(c[i], upd);
    return {
      lastErrorObject: { n: 1, updatedExisting: true },
      value: ret ? c[i] : before,
      ok: 1,
    };
  }

  if (cmd === "count") {
    const c = col(dbName, colName);
    return { n: c.filter((d) => matches(d, doc.query || {})).length, ok: 1 };
  }

  if (cmd === "aggregate") {
    const c = col(dbName, colName);
    const pipeline = doc.pipeline || [];
    let res = JSON.parse(JSON.stringify(c));

    for (const stage of pipeline) {
      const sk = Object.keys(stage)[0];
      const sv = stage[sk];
      if (sk === "$match") res = res.filter((d) => matches(d, sv));
      else if (sk === "$limit") res = res.slice(0, sv);
      else if (sk === "$skip") res = res.slice(sv);
      else if (sk === "$sort") res = doSort(res, sv);
      else if (sk === "$project") res = res.map((d) => doProject(d, sv));
      else if (sk === "$count") res = [{ [sv]: res.length }];
      else if (sk === "$addFields" || sk === "$set") {
        res = res.map((d) => {
          const r = { ...d };
          for (const [k, v] of Object.entries(sv)) {
            r[k] =
              typeof v === "string" && v.startsWith("$")
                ? getPath(d, v.slice(1))
                : v;
          }
          return r;
        });
      } else if (sk === "$group") {
        const idExpr = sv._id;
        const groups = new Map();
        for (const d of res) {
          const gk =
            typeof idExpr === "string" && idExpr?.startsWith("$")
              ? String(getPath(d, idExpr.slice(1)))
              : JSON.stringify(idExpr);
          if (!groups.has(gk)) {
            const g = {
              _id:
                typeof idExpr === "string" && idExpr?.startsWith("$")
                  ? getPath(d, idExpr.slice(1))
                  : idExpr,
            };
            for (const [f, e] of Object.entries(sv)) {
              if (f === "_id") continue;
              if (e.$sum !== undefined) g[f] = 0;
              else if (e.$count !== undefined) g[f] = 0;
              else if (e.$avg !== undefined) g[f] = { s: 0, c: 0 };
              else if (e.$push !== undefined) g[f] = [];
              else if (e.$first !== undefined)
                g[f] =
                  typeof e.$first === "string" && e.$first.startsWith("$")
                    ? getPath(d, e.$first.slice(1))
                    : e.$first;
              else if (e.$last !== undefined) g[f] = undefined;
            }
            groups.set(gk, g);
          }
          const g = groups.get(gk);
          for (const [f, e] of Object.entries(sv)) {
            if (f === "_id") continue;
            const fv =
              typeof (e.$sum ?? e.$avg ?? e.$first ?? e.$last ?? e.$push) ===
                "string" &&
              String(
                e.$sum ?? e.$avg ?? e.$first ?? e.$last ?? e.$push,
              ).startsWith("$")
                ? getPath(
                    d,
                    String(
                      e.$sum ?? e.$avg ?? e.$first ?? e.$last ?? e.$push,
                    ).slice(1),
                  )
                : null;
            if (e.$sum !== undefined)
              g[f] =
                (g[f] || 0) + (e.$sum === 1 ? 1 : Number(fv ?? e.$sum) || 0);
            else if (e.$count !== undefined) g[f] = (g[f] || 0) + 1;
            else if (e.$avg !== undefined) {
              g[f].s += Number(fv || 0);
              g[f].c++;
            } else if (e.$push !== undefined) {
              const pv =
                typeof e.$push === "string" && e.$push.startsWith("$")
                  ? getPath(d, e.$push.slice(1))
                  : e.$push;
              g[f].push(pv);
            } else if (e.$last !== undefined) {
              g[f] =
                typeof e.$last === "string" && e.$last.startsWith("$")
                  ? getPath(d, e.$last.slice(1))
                  : e.$last;
            }
          }
        }
        res = [...groups.values()].map((g) => {
          const r = { ...g };
          for (const [k, v] of Object.entries(r)) {
            if (
              v &&
              typeof v === "object" &&
              v.s !== undefined &&
              v.c !== undefined
            )
              r[k] = v.c ? v.s / v.c : 0;
          }
          return r;
        });
      }
    }
    return {
      cursor: { id: 0, ns: `${dbName}.${colName}`, firstBatch: res },
      ok: 1,
    };
  }

  if (cmd === "getmore") {
    return { cursor: { id: 0, ns: `${dbName}.$cmd`, nextBatch: [] }, ok: 1 };
  }

  return { ok: 1 };
}

// ─── Wire Protocol ────────────────────────────────────────────────────────────

const OP_MSG = 2013,
  OP_QUERY = 2004,
  OP_REPLY = 1;

function msgReply(reqId, doc) {
  let bson;
  try {
    bson = encodeBSON(doc);
  } catch (e) {
    bson = encodeBSON({ ok: 1 });
  }
  const h = Buffer.allocUnsafe(21);
  h.writeInt32LE(21 + bson.length, 0);
  h.writeInt32LE(Math.floor(Math.random() * 0x7fffffff), 4);
  h.writeInt32LE(reqId, 8);
  h.writeInt32LE(OP_MSG, 12);
  h.writeInt32LE(0, 16);
  h[20] = 0;
  return Buffer.concat([h, bson]);
}

function queryReply(reqId, doc) {
  let bson;
  try {
    bson = encodeBSON(doc);
  } catch (e) {
    bson = encodeBSON({ ok: 1 });
  }
  const h = Buffer.allocUnsafe(36);
  h.writeInt32LE(36 + bson.length, 0);
  h.writeInt32LE(Math.floor(Math.random() * 0x7fffffff), 4);
  h.writeInt32LE(reqId, 8);
  h.writeInt32LE(OP_REPLY, 12);
  h.writeInt32LE(0, 16);
  h.writeBigInt64LE(0n, 20);
  h.writeInt32LE(0, 28);
  h.writeInt32LE(1, 32);
  return Buffer.concat([h, bson]);
}

function readCStr(buf, pos) {
  let e = pos;
  while (e < buf.length && buf[e] !== 0) e++;
  return { v: buf.slice(pos, e).toString("utf8"), p: e + 1 };
}

function createServer(port) {
  const srv = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 16) {
        const len = buf.readInt32LE(0);
        if (buf.length < len) break;
        const msg = buf.slice(0, len);
        buf = buf.slice(len);
        try {
          const reqId = msg.readInt32LE(4);
          const op = msg.readInt32LE(12);
          if (op === OP_QUERY) {
            let pos = 20;
            const f = msg.readInt32LE(pos);
            pos += 4;
            const { v: ns, p } = readCStr(msg, pos);
            pos = p + 8;
            const q = decodeBSON(msg, pos);
            const db = ns.split(".")[0];
            socket.write(queryReply(reqId, handle(q, db)));
          } else if (op === OP_MSG) {
            const pos = 20;
            const sk = msg[pos];
            if (sk === 0) {
              const doc = decodeBSON(msg, pos + 1);
              const db = doc.$db || "test";
              socket.write(msgReply(reqId, handle(doc, db)));
            } else {
              socket.write(msgReply(reqId, { ok: 1 }));
            }
          }
        } catch (e) {
          /* ignore */
        }
      }
    });
    socket.on("error", () => {});
  });

  return new Promise((resolve, reject) => {
    srv.on("error", reject);
    srv.listen(port || 0, "127.0.0.1", () => {
      const p = srv.address().port;
      resolve({
        port: p,
        uri: `mongodb://127.0.0.1:${p}/`,
        stop: () => new Promise((r) => srv.close(r)),
        clearAll: () => store.clear(),
      });
    });
  });
}

module.exports = { createServer };
