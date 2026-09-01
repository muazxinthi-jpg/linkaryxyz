import assert from 'node:assert/strict';
import test from 'node:test';
import { Db } from '../src/db/client';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/platform';

class FakeStatement implements D1PreparedStatement {
  constructor(private readonly database: FakeDatabase, private readonly sql: string) {}
  bind(..._values: unknown[]): D1PreparedStatement { return this; }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    this.database.executed.push(`FIRST:${this.sql}`);
    return null;
  }
  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.database.executed.push(`ALL:${this.sql}`);
    return { success: true, results: [] };
  }
  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.database.executed.push(`RUN:${this.sql}`);
    return { success: true };
  }
}

class FakeDatabase implements D1Database {
  executed: string[] = [];
  prepare(query: string): D1PreparedStatement { return new FakeStatement(this, query); }
  async batch<T = unknown>(_statements: D1PreparedStatement[]): Promise<D1Result<T>[]> { return []; }
}

test('first CDP auth query self-heals migration 0002/0003 tables before lookup', async () => {
  const database = new FakeDatabase();
  const db = new Db(database);

  await db.first(`SELECT id, user_id FROM cdp_user_links WHERE cdp_project_id = ? AND cdp_user_id = ?`, ['project', 'user']);

  const trace = database.executed.join('\n');
  assert.match(trace, /CREATE TABLE IF NOT EXISTS cdp_user_links/);
  assert.match(trace, /CREATE TABLE IF NOT EXISTS wallet_accounts/);
  assert.match(trace, /CREATE TABLE IF NOT EXISTS creator_access_claims/);
  assert.match(trace, /CREATE TABLE IF NOT EXISTS admin_settings/);
  assert.match(trace, /INSERT OR IGNORE INTO admin_settings/);
  assert.ok(trace.indexOf('CREATE TABLE IF NOT EXISTS cdp_user_links') < trace.indexOf('FIRST:SELECT id, user_id FROM cdp_user_links'));
});
