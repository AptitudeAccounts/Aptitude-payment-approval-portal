import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { authRouter } from "./routes/auth";
import { requestsRouter } from "./routes/requests";
import { approvalsRouter } from "./routes/approvals";
import { referenceRouter } from "./routes/reference";
import { autoSeedIfEmpty } from "./services/autoSeed";

const app = express();

// Force HTTPS in production (assumes TLS termination at a load balancer/proxy
// forwarding X-Forwarded-Proto; adapt if terminating TLS directly on this app).
app.set("trust proxy", 1);
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] !== "https") {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

app.use(helmet());
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: !corsOrigin || corsOrigin === "*" ? "*" : corsOrigin.split(","),
  })
);
app.use(express.json({ limit: "6mb" }));

// Basic brute-force protection on auth endpoints
app.use(
  "/api/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })
);

app.use("/api/auth", authRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/reference", referenceRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 4000);
autoSeedIfEmpty()
  .catch((err) => console.error("Auto-seed failed:", err))
  .finally(() => {
    app.listen(port, () => console.log(`Approval Portal API listening on :${port}`));
  });
