import "dotenv/config";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { pool } from "./db.js";
import { parseCreate, parseUpdate } from "./validate.js";
import type { Expense } from "./validate.js";

const COLUMNS = "id, description, amount, category, date, note";
// The only column names we ever put into SQL text. They come from this list,
// never from the request, so nobody can inject SQL through a field name.
const COLUMN_NAMES = [
  "description",
  "amount",
  "category",
  "date",
  "note",
] as const;

const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isReadOnly = process.env.READ_ONLY === "true";

const app = express();
app.disable("x-powered-by");

// Only the websites listed in CORS_ORIGIN may call this API from a browser.
app.use(
  cors({ origin: allowedOrigins, methods: ["GET", "POST", "PATCH", "DELETE"] }),
);
app.use(express.json());

// A "demo mode": with READ_ONLY=true nobody can add, change or delete anything.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (isReadOnly && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    res.status(403).json({ message: "This demo is read-only." });
    return;
  }
  next();
});

// "2" -> 2. Anything else (like "abc", "2.5" or a list of values) -> null.
// Express's types say a route parameter can be text OR a list of texts, so we
// check what we really received before using it.
function parseId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Render calls this to see that the service is alive. It does not touch the
// database, so it never wakes a sleeping database for nothing.
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/expenses", async (_req: Request, res: Response) => {
  const { rows } = await pool.query<Expense>(
    `SELECT ${COLUMNS} FROM expenses ORDER BY date DESC, id DESC`,
  );
  res.json(rows);
});

app.get("/expenses/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json({ message: "Expense not found." });
    return;
  }

  const { rows } = await pool.query<Expense>(
    `SELECT ${COLUMNS} FROM expenses WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) {
    res.status(404).json({ message: "Expense not found." });
    return;
  }
  res.json(rows[0]);
});

app.post("/expenses", async (req: Request, res: Response) => {
  const parsed = parseCreate(req.body);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  const { description, amount, category, date, note } = parsed.value;
  // $1, $2... keep the values separate from the SQL: this is what stops SQL injection.
  const { rows } = await pool.query<Expense>(
    `INSERT INTO expenses (description, amount, category, date, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [description, amount, category, date, note],
  );
  res.status(201).json(rows[0]);
});

app.patch("/expenses/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json({ message: "Expense not found." });
    return;
  }

  const parsed = parseUpdate(req.body);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  // Build "description = $1, amount = $2 ..." for ONLY the fields that were sent.
  const sets: string[] = [];
  const values: (string | number)[] = [];
  for (const column of COLUMN_NAMES) {
    const value = parsed.value[column];
    if (value !== undefined) {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
  }
  values.push(id);

  const { rows } = await pool.query<Expense>(
    `UPDATE expenses SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${COLUMNS}`,
    values,
  );
  if (rows.length === 0) {
    res.status(404).json({ message: "Expense not found." });
    return;
  }
  res.json(rows[0]);
});

app.delete("/expenses/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json({ message: "Expense not found." });
    return;
  }

  const result = await pool.query("DELETE FROM expenses WHERE id = $1", [id]);
  if (!result.rowCount) {
    res.status(404).json({ message: "Expense not found." });
    return;
  }
  res.json({});
});

// Last stop for any error. Express 5 sends the errors of async routes here.
// It needs all four parameters, even the ones we do not use.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ message: "The request body is not valid JSON." });
    return;
  }
  console.error(error);
  res.status(500).json({ message: "Something went wrong on the server." });
});

// Render tells us which port to use through the PORT variable.
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Spendbook API listening on port ${port}`);
});
