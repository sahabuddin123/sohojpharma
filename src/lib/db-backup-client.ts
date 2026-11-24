// Browser-side helpers: build SQL / SQLite files and read SQLite backups.
import type { CatalogTable } from "@/lib/api/db-backup.functions";

export type TableDump = { table: CatalogTable; rows: Record<string, unknown>[] };

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;


// ---------- MySQL / phpMyAdmin compatible dump ----------
const mq = (id: string) => "`" + id.replace(/`/g, "``") + "`";

function myType(c: CatalogTable["columns"][number]): string {
  const t = c.type.toLowerCase();
  if (t === "uuid") return "CHAR(36)";
  if (t === "boolean") return "TINYINT(1)";
  if (t === "smallint") return "SMALLINT";
  if (t === "integer") return "INT";
  if (t === "bigint") return "BIGINT";
  if (t === "numeric" || t === "decimal") return "DECIMAL(20,4)";
  if (t === "real") return "FLOAT";
  if (t === "double precision") return "DOUBLE";
  if (t === "date") return "DATE";
  if (t.startsWith("timestamp")) return "DATETIME(6)";
  if (t.startsWith("time")) return "TIME";
  if (t === "json" || t === "jsonb" || t === "array") return "JSON";
  if (t === "character varying" || t === "character") return "VARCHAR(255)";
  return "LONGTEXT"; // text, enums (USER-DEFINED), inet, bytea, etc.
}

function myLiteral(v: unknown, c: CatalogTable["columns"][number]): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (c.type.toLowerCase().startsWith("timestamp")) {
    // 2026-09-26T10:00:00.123+00:00 -> 2026-09-26 10:00:00.123000 (UTC)
    const d = new Date(s);
    if (!isNaN(d.getTime())) s = d.toISOString().replace("T", " ").replace("Z", "");
  }
  s = s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\0/g, "\\0");
  return `'${s}'`;
}

export function buildSql(dumps: TableDump[], label: string): string {
  const out: string[] = [
    `-- SohojPharma MySQL backup: ${label}`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- Import: phpMyAdmin > select database > Import > choose this .sql file`,
    "",
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
    "SET time_zone = '+00:00';",
    "START TRANSACTION;",
    "",
  ];
  for (const { table, rows } of dumps) {
    const cols = table.columns;
    const hasId = cols.some((c) => c.name === "id");
    out.push(`-- Table: ${table.table_name} (${rows.length} rows)`);
    out.push(`DROP TABLE IF EXISTS ${mq(table.table_name)};`);
    const defs = cols.map((c) => {
      let ty = myType(c);
      if (c.name === "id" && ty === "LONGTEXT") ty = "VARCHAR(191)";
      return `  ${mq(c.name)} ${ty}${c.nullable ? " NULL" : " NOT NULL"}`;
    });
    if (hasId) defs.push(`  PRIMARY KEY (${mq("id")})`);
    out.push(`CREATE TABLE ${mq(table.table_name)} (\n${defs.join(",\n")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    const names = cols.map((c) => mq(c.name)).join(", ");
    for (let i = 0; i < rows.length; i += 200) {
      const vals = rows
        .slice(i, i + 200)
        .map((r) => `(${cols.map((c) => myLiteral(r[c.name], c)).join(", ")})`)
        .join(",\n");
      out.push(`INSERT IGNORE INTO ${mq(table.table_name)} (${names}) VALUES\n${vals};`);
    }
    out.push("");
  }
  out.push("COMMIT;", "SET FOREIGN_KEY_CHECKS = 1;");
  return out.join("\n");
}

async function loadSqlJs() {
  const initSqlJs = (await import("sql.js")).default;
  return initSqlJs({ locateFile: (f: string) => `https://sql.js.org/dist/${f}` });
}

function sqliteValue(v: unknown) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export async function buildSqlite(dumps: TableDump[]): Promise<Uint8Array> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE __pc_meta (key TEXT PRIMARY KEY, value TEXT)");
  db.run("INSERT INTO __pc_meta VALUES ('created_at', ?), ('catalog', ?)", [
    new Date().toISOString(),
    JSON.stringify(dumps.map((d) => d.table)),
  ]);
  for (const { table, rows } of dumps) {
    const cols = table.columns.map((c) => q(c.name));
    db.run(`CREATE TABLE ${q(table.table_name)} (${cols.join(", ")})`);
    if (!rows.length) continue;
    const stmt = db.prepare(
      `INSERT INTO ${q(table.table_name)} VALUES (${cols.map(() => "?").join(",")})`,
    );
    db.run("BEGIN");
    for (const r of rows) stmt.run(table.columns.map((c) => sqliteValue(r[c.name])) as any);
    db.run("COMMIT");
    stmt.free();
  }
  const bytes = db.export();
  db.close();
  return bytes;
}

/** Read a SQLite backup created by buildSqlite back into typed rows. */
export async function readSqlite(file: File): Promise<TableDump[]> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const meta = db.exec("SELECT value FROM __pc_meta WHERE key='catalog'");
    const catalog = JSON.parse(String(meta[0]?.values[0]?.[0] ?? "[]")) as CatalogTable[];
    return catalog.map((table) => {
      const res = db.exec(`SELECT * FROM ${q(table.table_name)}`)[0];
      const rows = (res?.values ?? []).map((vals) => {
        const o: Record<string, unknown> = {};
        res!.columns.forEach((name, i) => {
          const col = table.columns.find((c) => c.name === name);
          let v: unknown = vals[i];
          if (v !== null && col) {
            if (col.type === "boolean") v = v === 1 || v === "1" || v === true;
            else if ((col.type === "json" || col.type === "jsonb" || col.type === "ARRAY") && typeof v === "string") {
              try { v = JSON.parse(v); } catch { /* keep text */ }
            }
          }
          o[name] = v;
        });
        return o;
      });
      return { table, rows };
    });
  } catch {
    throw new Error("This file is not a SohojPharma SQLite backup.");
  } finally {
    db.close();
  }
}

export function downloadBlob(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
