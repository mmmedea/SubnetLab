import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationFiles = [
  "20261123122151_google_provider_workspace_rls.sql",
  "20261124083156_restore_password_otp_for_all_workspace_users.sql",
];
const policyNames = [
  "network plans owner",
  "allocations owner",
  "assignments owner",
  "attempts owner",
];

function policyStatement(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(new RegExp(`create\\s+policy\\s+"${escaped}"[\\s\\S]*?;`, "i"));
  assert.ok(match, `Missing policy ${name}`);
  return match[0];
}

for (const filename of migrationFiles) {
  const sql = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8");
  for (const name of policyNames) {
    test(`${filename} keeps ${name} behind password and email OTP`, () => {
      const statement = policyStatement(sql, name);
      assert.ok((statement.match(/is_email_otp_session_verified\(\)/gi) || []).length >= 2);
      assert.ok((statement.match(/password_configured_at\s+is\s+not\s+null/gi) || []).length >= 2);
      assert.ok((statement.match(/auth\.uid\(\)/gi) || []).length >= 2);
      assert.doesNotMatch(statement, /app_metadata|provider|google/i);
    });
  }
}
