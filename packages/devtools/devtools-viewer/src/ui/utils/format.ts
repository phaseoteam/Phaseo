export function safeJson(value: unknown, space: number = 2): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === "bigint") return val.toString();
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) {
            return "[Circular]";
          }
          seen.add(val);
        }
        return val;
      },
      space
    );
  } catch (error) {
    return JSON.stringify(
      {
        error: "Unable to serialize payload",
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      space
    );
  }
}
