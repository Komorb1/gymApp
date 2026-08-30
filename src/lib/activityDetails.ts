export type ActivityValue = string | number | boolean | null;

export type ActivityChange = {
  field: string;
  before: ActivityValue;
  after: ActivityValue;
};

const hiddenFields = new Set([
  "id",
  "member_id",
  "plan_id",
  "user_id",
  "created_at",
  "updated_at",
  "deleted_at",
  "photo_path",
  "whatsapp_no",
  "frozen_at",
]);

function parseDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const record = parsed as Record<string, unknown>;
    const renewal = record.new_membership;
    return renewal && typeof renewal === "object" && !Array.isArray(renewal)
      ? (renewal as Record<string, unknown>)
      : record;
  } catch {
    return null;
  }
}

function primitive(value: unknown): ActivityValue | undefined {
  if (value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return value as ActivityValue;
  }
  return undefined;
}

function snapshotName(value: Record<string, unknown>): string | null {
  const parts = [value.first_name, value.middle_name, value.last_name]
    .filter(
      (part): part is string => typeof part === "string" && part.trim() !== "",
    )
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(" ") : null;
}

function readableFields(
  record: Record<string, unknown> | null,
): Map<string, ActivityValue> {
  const fields = new Map<string, ActivityValue>();
  if (!record) return fields;

  for (const [key, value] of Object.entries(record)) {
    if (hiddenFields.has(key)) continue;
    if (
      key === "member_snapshot" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const snapshot = value as Record<string, unknown>;
      fields.set("member", snapshotName(snapshot));
      const phone = primitive(snapshot.phone);
      if (phone !== undefined) fields.set("phone", phone);
      continue;
    }
    if (
      key === "plan_snapshot" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const snapshot = value as Record<string, unknown>;
      const name = primitive(snapshot.name);
      const price = primitive(snapshot.price_cents);
      if (name !== undefined) fields.set("plan", name);
      if (price !== undefined) fields.set("price_cents", price);
      continue;
    }
    if (key === "previous_membership" || key === "new_membership") continue;
    const valuePrimitive = primitive(value);
    if (valuePrimitive !== undefined) fields.set(key, valuePrimitive);
  }
  return fields;
}

export function activityChanges(
  beforeDetails: string | null,
  afterDetails: string | null,
): ActivityChange[] {
  const before = readableFields(parseDetails(beforeDetails));
  const after = readableFields(parseDetails(afterDetails));
  const keys = [...before.keys(), ...after.keys()].filter(
    (key, index, all) => all.indexOf(key) === index,
  );

  return keys
    .filter(
      (field) => (before.get(field) ?? null) !== (after.get(field) ?? null),
    )
    .map((field) => ({
      field,
      before: before.get(field) ?? null,
      after: after.get(field) ?? null,
    }));
}
