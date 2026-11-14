CREATE TABLE news_cache (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 payload TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE news_locks (
 name TEXT PRIMARY KEY,
 expires_at INTEGER NOT NULL
);
CREATE TABLE news_subscriptions (
 id TEXT PRIMARY KEY,
 subscription TEXT NOT NULL,
 topics TEXT NOT NULL,
 frequency TEXT NOT NULL,
 created_at TEXT NOT NULL,
 last_sent_at TEXT,
 sent_ids TEXT NOT NULL DEFAULT '[]',
 last_test_at TEXT
);
CREATE TABLE news_deliveries (
 subscription_id TEXT NOT NULL,
 slot TEXT NOT NULL,
 status TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY (subscription_id,slot)
);
