const cache = new Map();

exports.setCache = (key, value, ttlMs) => {
  const expiresAt = Date.now() + ttlMs;
  cache.set(key, { value, expiresAt });
};

exports.getCache = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};
