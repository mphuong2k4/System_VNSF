import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { loadConfig } from "@vnsf/config";
import { Pool, PoolClient, QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: loadConfig().DATABASE_URL,
    max: 20,
    statement_timeout: 10_000,
  });
  query<T extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ) {
    return this.pool.query<T>(text, [...values]);
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
