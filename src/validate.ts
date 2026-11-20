export const CATEGORIES = [
  "Food",
  "Transport",
  "School",
  "Phone and data",
  "Fun",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// A type alias (not an interface) so it fits the typing of the `pg` library.
export type Expense = {
  id: number;
  description: string;
  amount: number;
  category: Category;
  date: string;
  note: string;
};

export type ExpenseInput = Omit<Expense, "id">;

type Failure = { ok: false; message: string };
type Result<T> = { ok: true; value: T } | Failure;

const MAX_AMOUNT = 100_000_000;

function fail(message: string): Failure {
  return { ok: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkDescription(value: unknown): Result<string> {
  if (typeof value !== "string") {
    return fail("description must be text.");
  }
  const text = value.trim();
  if (text === "" || text.length > 80) {
    return fail("description must be 1 to 80 characters.");
  }
  return { ok: true, value: text };
}

function checkAmount(value: unknown): Result<number> {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_AMOUNT
  ) {
    return fail("amount must be a whole number greater than 0.");
  }
  return { ok: true, value };
}

function checkCategory(value: unknown): Result<Category> {
  // find() returns a real Category (or undefined), so no `as` is needed.
  const category = CATEGORIES.find((item) => item === value);
  return category
    ? { ok: true, value: category }
    : fail("category is not one of the allowed categories.");
}

// The app already stops dates in the future. The server only checks that the
// date is a real calendar day: the server's "today" can differ from the user's.
function checkDate(value: unknown): Result<string> {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail("date must look like 2026-10-24.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isReal =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  return isReal
    ? { ok: true, value }
    : fail("date is not a real calendar day.");
}

function checkNote(value: unknown): Result<string> {
  if (typeof value !== "string") {
    return fail("note must be text.");
  }
  const text = value.trim();
  if (text.length > 200) {
    return fail("note must be 200 characters or fewer.");
  }
  return { ok: true, value: text };
}

// POST: every field is needed (the note may be missing and counts as empty).
export function parseCreate(body: unknown): Result<ExpenseInput> {
  if (!isRecord(body)) {
    return fail("Send a JSON object.");
  }

  const description = checkDescription(body.description);
  if (!description.ok) return description;
  const amount = checkAmount(body.amount);
  if (!amount.ok) return amount;
  const category = checkCategory(body.category);
  if (!category.ok) return category;
  const date = checkDate(body.date);
  if (!date.ok) return date;
  const note = checkNote(body.note ?? "");
  if (!note.ok) return note;

  return {
    ok: true,
    value: {
      description: description.value,
      amount: amount.value,
      category: category.value,
      date: date.value,
      note: note.value,
    },
  };
}

// PATCH: only the fields that are present are checked and changed.
// Unknown fields (like "id") are ignored on purpose.
export function parseUpdate(body: unknown): Result<Partial<ExpenseInput>> {
  if (!isRecord(body)) {
    return fail("Send a JSON object.");
  }

  const changes: Partial<ExpenseInput> = {};

  if ("description" in body) {
    const result = checkDescription(body.description);
    if (!result.ok) return result;
    changes.description = result.value;
  }
  if ("amount" in body) {
    const result = checkAmount(body.amount);
    if (!result.ok) return result;
    changes.amount = result.value;
  }
  if ("category" in body) {
    const result = checkCategory(body.category);
    if (!result.ok) return result;
    changes.category = result.value;
  }
  if ("date" in body) {
    const result = checkDate(body.date);
    if (!result.ok) return result;
    changes.date = result.value;
  }
  if ("note" in body) {
    const result = checkNote(body.note);
    if (!result.ok) return result;
    changes.note = result.value;
  }

  if (Object.keys(changes).length === 0) {
    return fail("Send at least one field to change.");
  }

  return { ok: true, value: changes };
}
