const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/server");

describe("GET / (API Root)", () => {
  it("should return a status message and 200 OK", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("status");
    expect(res.body.status).toBe("operational");
  });
});

describe("GET /api (API Info)", () => {
  it("should return API information", async () => {
    const res = await request(app).get("/api");
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("name");
    expect(res.body).toHaveProperty("endpoints");
  });
});

describe("GET /health (Health Check)", () => {
  it("should return health status", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty("status");
  });
});

describe("404 Handling", () => {
  it("should return 404 for unknown routes", async () => {
    const res = await request(app).get("/nonexistent-route-xyz");
    expect(res.statusCode).toEqual(404);
  });
});
