import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../services/tokens";
import { writeAuditLog } from "../services/audit";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-shape response whether the user exists or not, to avoid
  // leaking which emails are registered.
  const passwordHash = user?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinva";
  const valid = await bcrypt.compare(password, passwordHash);

  if (!user || !valid || !user.isActive) {
    await writeAuditLog({ req, action: "LOGIN_FAILED", metadata: { email } });
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const payload = { sub: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await writeAuditLog({ req, userId: user.id, action: "LOGIN_SUCCESS" });

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) return res.status(400).json({ error: "Missing refreshToken" });
  try {
    const payload = verifyRefreshToken(refreshToken);
    const accessToken = signAccessToken({ sub: payload.sub, role: payload.role });
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

authRouter.post("/logout", async (req, res) => {
  // Stateless JWTs: real logout support requires a token denylist/short TTL.
  // Left as an extension point; access tokens are short-lived by design.
  res.status(204).send();
});
