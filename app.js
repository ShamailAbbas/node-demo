// Load .env variables if present (for local development)
require('dotenv').config();

const express = require("express");
const client = require("prom-client");

const app = express();
const register = new client.Registry();

// Collect default metrics (CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({ register });

// --- Custom Metrics ---
const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"]
});
register.registerMetric(httpRequestCounter);

const responseTimeHistogram = new client.Histogram({
  name: "http_response_time_seconds",
  help: "Response time in seconds",
  labelNames: ["method", "route"]
});
register.registerMetric(responseTimeHistogram);

const errorCounter = new client.Counter({
  name: "http_errors_total",
  help: "Total number of HTTP errors",
  labelNames: ["method", "route"]
});
register.registerMetric(errorCounter);

// Middleware for latency + traffic
app.use((req, res, next) => {
  const end = responseTimeHistogram.startTimer({ method: req.method, route: req.path });
  res.on("finish", () => {
    httpRequestCounter.inc({ method: req.method, route: req.path, status: res.statusCode });
    if (res.statusCode >= 500) {
      errorCounter.inc({ method: req.method, route: req.path });
    }
    end();
  });
  next();
});

// --- Demo endpoints ---
app.get("/", (req, res) => res.send("Hello from Node.js demo 🚀"));
app.get("/slow", (req, res) => setTimeout(() => res.send("This was slow...."), 2000));
app.get("/error", (req, res) => res.status(500).send("Simulated server error"));
app.get("/load", (req, res) => {
  for (let i = 0; i < 1000; i++) Math.sqrt(Math.random() * i);
  res.send("Generated CPU load");
});

// --- Token-protected Metrics endpoint ---
app.get("/metrics", async (req, res) => {
  // const authHeader = req.headers['authorization'];
  // const token = process.env.METRICS_TOKEN;

  // console.log("Loaded METRICS_TOKEN:", token ? "✅ yes" : "❌ no");

  // // Expect token in format: "Bearer <token>"
  // if (!authHeader || authHeader !== `Bearer ${token}`) {
  //   return res.status(401).send("Unauthorized");
  // }

  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();  // Await the Promise
    res.send(metrics);                         // Send as string
  } catch (err) {
    console.error("Failed to get metrics:", err);
    res.status(500).send("Failed to get metrics");
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Demo app running on port ${PORT}`));

