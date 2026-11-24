import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";
import { assertBranchWrite } from "@/lib/api/branch-guard";

const AccountType = z.enum(["asset", "liability", "equity", "income", "expense", "cogs"]);
const PayMethod = z.enum(["cash", "bank", "bkash", "nagad", "rocket", "card", "cheque", "adjustment"]);

const TenantOnly = z.object({ tenant_id: z.string().uuid() });

/* ---------------- Chart of Accounts ---------------- */

export const listAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({ type: AccountType.optional(), active_only: z.boolean().default(true) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("chart_of_accounts")
      .select("id, code, name, type, parent_id, is_system, is_active, description")
      .eq("tenant_id", data.tenant_id)
      .order("code");
    if (data.type) q = q.eq("type", data.type);
    if (data.active_only) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const AccountUpsert = z.object({
  tenant_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  type: AccountType,
  parent_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
  description: z.string().max(500).optional(),
});

export const upsertAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) => AccountUpsert.parse(i))
  .handler(async ({ data, context }) => {
    const row = { ...data, parent_id: data.parent_id ?? null };
    const { data: out, error } = data.id
      ? await context.supabase.from("chart_of_accounts").update(row).eq("id", data.id).select().single()
      : await context.supabase.from("chart_of_accounts").insert(row).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

/* ---------------- Journals ---------------- */

const JournalLine = z.object({
  account_code: z.string().min(1),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  description: z.string().optional(),
});

const PostJournal = z.object({
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid().optional(),
  entry_no: z.string().min(1),
  entry_date: z.string().optional(), // ISO date
  notes: z.string().optional(),
  ref_table: z.string().optional(),
  ref_id: z.string().uuid().optional(),
  ref_no: z.string().optional(),
  lines: z.array(JournalLine).min(2),
});

export const postJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) => PostJournal.parse(i))
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const totalD = data.lines.reduce((s, l) => s + l.debit, 0);
    const totalC = data.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.round((totalD - totalC) * 10000) !== 0) {
      throw new Error(`Journal unbalanced: debit=${totalD} credit=${totalC}`);
    }
    const { data: out, error } = await context.supabase.rpc("post_journal", {
      _tenant_id: data.tenant_id,
      _entry_no: data.entry_no,
      _entry_date: data.entry_date ?? null,
      _notes: data.notes ?? null,
      _ref_table: data.ref_table ?? null,
      _ref_id: data.ref_id ?? null,
      _ref_no: data.ref_no ?? null,
      _lines: data.lines,
    } as never);
    if (error) throw new Error(error.message);
    const entryId = (out as { id?: string } | null)?.id;
    if (entryId && data.branch_id) {
      await context.supabase.from("journal_entries").update({ branch_id: data.branch_id }).eq("id", entryId);
      await context.supabase.from("journal_lines").update({ branch_id: data.branch_id }).eq("journal_id", entryId);
    }
    return out;
  });

export const listJournals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("journal_entries")
      .select("id, entry_no, entry_date, notes, ref_table, ref_no, total_debit, total_credit, created_at")
      .eq("tenant_id", data.tenant_id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("entry_date", data.from);
    if (data.to) q = q.lte("entry_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: header, error: e1 } = await context.supabase
      .from("journal_entries").select("*").eq("id", data.id).eq("tenant_id", data.tenant_id).single();
    if (e1) throw new Error(e1.message);
    const { data: lines, error: e2 } = await context.supabase
      .from("journal_lines")
      .select("id, account_id, debit, credit, description, chart_of_accounts(code, name, type)")
      .eq("journal_id", data.id)
      .eq("tenant_id", data.tenant_id);
    if (e2) throw new Error(e2.message);
    return { ...header, lines: lines ?? [] };
  });

/* ---------------- Expenses ---------------- */

const ExpenseInput = z.object({
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid().optional(),
  expense_no: z.string().min(1),
  expense_date: z.string().optional(),
  account_code: z.string().min(1),
  amount: z.number().positive(),
  payment_method: PayMethod.default("cash"),
  vendor: z.string().max(120).optional(),
  reference_no: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
});

const cashAccountFor = (m: z.infer<typeof PayMethod>) => {
  switch (m) {
    case "bank": return "1010";
    case "bkash": return "1020";
    case "nagad": return "1030";
    case "rocket": return "1020";
    default: return "1000"; // cash / card / cheque / adjustment default to cash on hand
  }
};

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) => ExpenseInput.parse(i))
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { data: acc, error: e0 } = await context.supabase
      .from("chart_of_accounts").select("id").eq("tenant_id", data.tenant_id).eq("code", data.account_code).single();
    if (e0 || !acc) throw new Error("Account not found: " + data.account_code);

    // Post balanced journal: Dr expense account, Cr cash/bank
    const { data: je, error: eJ } = await context.supabase.rpc("post_journal", {
      _tenant_id: data.tenant_id,
      _entry_no: "EXP-" + data.expense_no,
      _entry_date: data.expense_date ?? null,
      _notes: data.notes ?? null,
      _ref_table: "expenses",
      _ref_id: null,
      _ref_no: data.expense_no,
      _lines: [
        { account_code: data.account_code, debit: data.amount, credit: 0, description: data.vendor ?? data.notes },
        { account_code: cashAccountFor(data.payment_method), debit: 0, credit: data.amount, description: "Payment" },
      ],
    } as never);
    if (eJ) throw new Error(eJ.message);

    const journalId = (je as { id: string }).id;
    if (data.branch_id) {
      await context.supabase.from("journal_entries").update({ branch_id: data.branch_id }).eq("id", journalId);
      await context.supabase.from("journal_lines").update({ branch_id: data.branch_id }).eq("journal_id", journalId);
    }

    const { data: row, error } = await context.supabase
      .from("expenses").insert({
        tenant_id: data.tenant_id,
        branch_id: data.branch_id!,
        expense_no: data.expense_no,
        expense_date: data.expense_date ?? new Date().toISOString().slice(0, 10),
        account_id: acc.id,
        amount: data.amount,
        payment_method: data.payment_method,
        vendor: data.vendor,
        reference_no: data.reference_no,
        notes: data.notes,
        journal_id: journalId,
        created_by: context.userId,
      }).select().single();
    if (error) throw new Error(error.message);
    if (data.branch_id) {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "expense.create", entity_table: "expenses", entity_id: row.id,
        after_data: { expense_no: data.expense_no, amount: data.amount },
      });
    }
    return row;
  });

export const listExpenses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("expenses")
      .select("id, expense_no, expense_date, amount, payment_method, vendor, reference_no, notes, account_id, chart_of_accounts(code, name)")
      .eq("tenant_id", data.tenant_id)
      .order("expense_date", { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("expense_date", data.from);
    if (data.to) q = q.lte("expense_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------------- Incomes ---------------- */

const IncomeInput = z.object({
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid().optional(),
  income_no: z.string().min(1),
  income_date: z.string().optional(),
  account_code: z.string().min(1),
  amount: z.number().positive(),
  payment_method: PayMethod.default("cash"),
  source: z.string().max(120).optional(),
  reference_no: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
});

export const createIncome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) => IncomeInput.parse(i))
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { data: acc, error: e0 } = await context.supabase
      .from("chart_of_accounts").select("id").eq("tenant_id", data.tenant_id).eq("code", data.account_code).single();
    if (e0 || !acc) throw new Error("Account not found: " + data.account_code);

    // Dr cash/bank, Cr income account
    const { data: je, error: eJ } = await context.supabase.rpc("post_journal", {
      _tenant_id: data.tenant_id,
      _entry_no: "INC-" + data.income_no,
      _entry_date: data.income_date ?? null,
      _notes: data.notes ?? null,
      _ref_table: "incomes",
      _ref_id: null,
      _ref_no: data.income_no,
      _lines: [
        { account_code: cashAccountFor(data.payment_method), debit: data.amount, credit: 0, description: data.source ?? "Receipt" },
        { account_code: data.account_code, debit: 0, credit: data.amount, description: data.notes },
      ],
    } as never);
    if (eJ) throw new Error(eJ.message);

    const journalId = (je as { id: string }).id;
    if (data.branch_id) {
      await context.supabase.from("journal_entries").update({ branch_id: data.branch_id }).eq("id", journalId);
      await context.supabase.from("journal_lines").update({ branch_id: data.branch_id }).eq("journal_id", journalId);
    }

    const { data: row, error } = await context.supabase
      .from("incomes").insert({
        tenant_id: data.tenant_id,
        branch_id: data.branch_id!,
        income_no: data.income_no,
        income_date: data.income_date ?? new Date().toISOString().slice(0, 10),
        account_id: acc.id,
        amount: data.amount,
        payment_method: data.payment_method,
        source: data.source,
        reference_no: data.reference_no,
        notes: data.notes,
        journal_id: journalId,
        created_by: context.userId,
      }).select().single();
    if (error) throw new Error(error.message);
    if (data.branch_id) {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "income.create", entity_table: "incomes", entity_id: row.id,
        after_data: { income_no: data.income_no, amount: data.amount },
      });
    }
    return row;
  });

export const listIncomes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("incomes")
      .select("id, income_no, income_date, amount, payment_method, source, reference_no, notes, account_id, chart_of_accounts(code, name)")
      .eq("tenant_id", data.tenant_id)
      .order("income_date", { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("income_date", data.from);
    if (data.to) q = q.lte("income_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------------- Account ledger / trial balance ---------------- */

export const getAccountLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      account_code: z.string().min(1),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: acc, error: e0 } = await context.supabase
      .from("chart_of_accounts").select("id, code, name, type")
      .eq("tenant_id", data.tenant_id).eq("code", data.account_code).single();
    if (e0 || !acc) throw new Error("Account not found");

    let q = context.supabase
      .from("journal_lines")
      .select("id, debit, credit, description, journal_entries!inner(entry_no, entry_date, ref_table, ref_no)")
      .eq("tenant_id", data.tenant_id)
      .eq("account_id", acc.id);
    if (data.from) q = q.gte("journal_entries.entry_date", data.from);
    if (data.to) q = q.lte("journal_entries.entry_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let bal = 0;
    const lines = (rows ?? [])
      .sort((a: { journal_entries: { entry_date: string } }, b: { journal_entries: { entry_date: string } }) =>
        a.journal_entries.entry_date.localeCompare(b.journal_entries.entry_date))
      .map((r: { debit: number; credit: number; description: string | null; journal_entries: { entry_no: string; entry_date: string; ref_no: string | null } }) => {
        bal += Number(r.debit) - Number(r.credit);
        return { ...r, running_balance: bal };
      });
    return { account: acc, lines, closing_balance: bal };
  });

export const getTrialBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({ as_of: z.string().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("journal_lines")
      .select("debit, credit, account_id, chart_of_accounts(code, name, type), journal_entries!inner(entry_date)")
      .eq("tenant_id", data.tenant_id);
    if (data.as_of) q = q.lte("journal_entries.entry_date", data.as_of);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const map = new Map<string, { code: string; name: string; type: string; debit: number; credit: number }>();
    for (const r of rows ?? []) {
      const a = (r as { chart_of_accounts: { code: string; name: string; type: string } }).chart_of_accounts;
      if (!a) continue;
      const cur = map.get(a.code) ?? { code: a.code, name: a.name, type: a.type, debit: 0, credit: 0 };
      cur.debit += Number(r.debit);
      cur.credit += Number(r.credit);
      map.set(a.code, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  });
