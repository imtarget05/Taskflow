-- Track implicit user feedback on NLP ticket analyses (1-click apply vs ignore).
-- This is the "eval ngầm" signal from real user behavior — no manual labeling.

CREATE TABLE "nlp_feedbacks" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "analysisId"  TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "priority"    TEXT NOT NULL,
  "decision"    TEXT NOT NULL, -- "applied" | "ignored"
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nlp_feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "nlp_feedbacks_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ticket_analyses" ("id") ON DELETE CASCADE
);

CREATE INDEX "nlp_feedbacks_userId_createdAt_idx" ON "nlp_feedbacks" ("userId", "createdAt");
CREATE INDEX "nlp_feedbacks_category_idx" ON "nlp_feedbacks" ("category");
