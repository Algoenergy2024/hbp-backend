import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, signToken, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters")
});

router.post("/register", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if ((existing.rowCount ?? 0) > 0) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
    [email, passwordHash]
  );
  const userId = rows[0]!.id;
  res.status(201).json({ token: signToken(userId), userId });
});

router.post("/login", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;

  const { rows } = await pool.query<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: "Incorrect email or password" });
    return;
  }
  res.json({ token: signToken(user.id), userId: user.id });
});

// So the frontend knows whether to show admin-only controls (assumptions
// editing) without guessing from a failed write attempt.
router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<{ id: number; email: string; is_admin: boolean }>(
    "SELECT id, email, is_admin FROM users WHERE id = $1",
    [req.userId]
  );
  const user = rows[0];
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ id: user.id, email: user.email, isAdmin: user.is_admin });
});

export default router;
