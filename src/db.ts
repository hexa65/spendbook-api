import pg from "pg";

// A DATE column normally comes back as a JavaScript Date object. That brings back
// the timezone problem we avoided in the app (the day can shift). This makes it
// come back as plain text like "2026-10-24", exactly what the app expects.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is missing. Copy .env.example to .env and fill it in.",
  );
}

export const pool = new pg.Pool({ connectionString, max: 5 });

// Neon pauses an idle database and closes idle connections. Without this handler,
// that harmless event could crash the whole server.
pool.on("error", (error) => {
  console.error("Unexpected database connection error:", error);
});
