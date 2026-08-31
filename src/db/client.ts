import type { D1Database, D1PreparedStatement } from '../platform';

export class Db {
  constructor(private readonly database: D1Database) {}

  statement(sql: string, values: unknown[] = []): D1PreparedStatement {
    return this.database.prepare(sql).bind(...values);
  }

  async first<T>(sql: string, values: unknown[] = []): Promise<T | null> {
    return this.statement(sql, values).first<T>();
  }

  async all<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.statement(sql, values).all<T>();
    return result.results || [];
  }

  async run(sql: string, values: unknown[] = []): Promise<void> {
    const result = await this.statement(sql, values).run();
    if (!result.success) throw new Error('D1 statement failed');
  }

  async batch(statements: D1PreparedStatement[]): Promise<void> {
    const results = await this.database.batch(statements);
    if (results.some((result) => !result.success)) throw new Error('D1 batch failed');
  }
}
