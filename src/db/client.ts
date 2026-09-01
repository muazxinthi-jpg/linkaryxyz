import type { D1Database, D1PreparedStatement } from '../platform';
import { ensureAuthRuntimeSchema } from './runtimeSchema';

const AUTH_RUNTIME_TABLE = /\b(cdp_user_links|wallet_accounts|creator_access_claims|admin_settings)\b/i;

export class Db {
  constructor(private readonly database: D1Database) {}

  private async ensureFor(sql: string): Promise<void> {
    if (AUTH_RUNTIME_TABLE.test(sql)) await ensureAuthRuntimeSchema(this.database);
  }

  statement(sql: string, values: unknown[] = []): D1PreparedStatement {
    return this.database.prepare(sql).bind(...values);
  }

  async first<T>(sql: string, values: unknown[] = []): Promise<T | null> {
    await this.ensureFor(sql);
    return this.statement(sql, values).first<T>();
  }

  async all<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    await this.ensureFor(sql);
    const result = await this.statement(sql, values).all<T>();
    return result.results || [];
  }

  async run(sql: string, values: unknown[] = []): Promise<void> {
    await this.ensureFor(sql);
    const result = await this.statement(sql, values).run();
    if (!result.success) throw new Error('D1 statement failed');
  }

  async batch(statements: D1PreparedStatement[]): Promise<void> {
    // Batch statements are opaque after preparation. Ensuring the additive auth
    // schema here makes batches safe even when they are the first auth DB work
    // performed by a warm Worker instance.
    await ensureAuthRuntimeSchema(this.database);
    const results = await this.database.batch(statements);
    if (results.some((result) => !result.success)) throw new Error('D1 batch failed');
  }
}
