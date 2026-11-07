// Keep Mongo-style identifier keys in API responses after moving to PostgreSQL.
const serializeIdentifiers = (value) => {
  if (Array.isArray(value)) return value.map(serializeIdentifiers);
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key === "id" ? "_id" : key,
      serializeIdentifiers(nestedValue),
    ])
  );
};

// Convert Prisma id fields to the existing API's _id response field.
export const apiSerializer = (req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(serializeIdentifiers(body));
  next();
};
