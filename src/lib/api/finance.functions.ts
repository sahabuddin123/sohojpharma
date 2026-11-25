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
  payment_account_code: z.string().min(1).optional(),
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
        { account_code: data.payment_account_code || cashAccountFor(data.payment_method), debit: 0, credit: data.amount, description: "Payment" },
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
        expense_date: data.expense_date ?? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10),
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

    // Mirror cash expenses into the cashier's currently open register drawer
    const payMethod = (data.payment_method || "cash").toLowerCase();
    const isCashDrawer = payMethod === "cash" && (!data.payment_account_code || data.payment_account_code === "1000");
    if (isCashDrawer) {
      const { data: openReg } = await context.supabase
        .from("cash_registers")
        .select("id")
        .eq("tenant_id", data.tenant_id)
        .eq("user_id", context.userId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openReg?.id) {
        await context.supabase.from("cash_register_transactions").insert({
          tenant_id: data.tenant_id,
          register_id: openReg.id,
          branch_id: data.branch_id ?? null,
          transaction_type: "expense",
          reference_table: "expenses",
          reference_id: row.id,
          reference_no: data.expense_no,
          amount: data.amount,
          payment_method: "cash",
          notes: data.notes ?? data.vendor ?? data.expense_no,
          created_by: context.userId,
        });
      }
    }

    if (data.branch_id) {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "expense.create", entity_table: "expenses", entity_id: row.id,
        after_data: { expense_no: data.expense_no, amount: data.amount },
      });
    }
    return row;
  });

export const updateExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) => ExpenseInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { data: existing, error: eFind } = await context.supabase
      .from("expenses")
      .select("id, journal_id")
      .eq("tenant_id", data.tenant_id)
      .eq("id", data.id)
      .single();
    if (eFind || !existing) throw new Error("Expense not found");

    const { data: acc, error: e0 } = await context.supabase
      .from("chart_of_accounts").select("id").eq("tenant_id", data.tenant_id).eq("code", data.account_code).single();
    if (e0 || !acc) throw new Error("Account not found: " + data.account_code);

    const creditCode = data.payment_account_code || cashAccountFor(data.payment_method);
    const { data: payAcc } = await context.supabase
      .from("chart_of_accounts").select("id").eq("tenant_id", data.tenant_id).eq("code", creditCode).maybeSingle();

    const { data: row, error } = await context.supabase
      .from("expenses")
      .update({
        expense_no: data.expense_no,
        expense_date: data.expense_date ?? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10),
        account_id: acc.id,
        amount: data.amount,
        payment_method: data.payment_method,
        vendor: data.vendor ?? null,
        reference_no: data.reference_no ?? null,
        notes: data.notes ?? null,
      })
      .eq("tenant_id", data.tenant_id)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (existing.journal_id) {
      await context.supabase
        .from("journal_entries")
        .update({ entry_date: data.expense_date, notes: data.notes ?? null })
        .eq("id", existing.journal_id)
        .eq("tenant_id", data.tenant_id);

      const { data: jLines } = await context.supabase
        .from("journal_lines")
        .select("id, debit, credit")
        .eq("journal_id", existing.journal_id);

      for (const jl of jLines ?? []) {
        if (Number(jl.debit) > 0) {
          await context.supabase.from("journal_lines").update({
            account_id: acc.id,
            debit: data.amount,
            description: data.vendor ?? data.notes ?? null,
          }).eq("id", jl.id);
        } else if (Number(jl.credit) > 0) {
          await context.supabase.from("journal_lines").update({
            ...(payAcc?.id ? { account_id: payAcc.id } : {}),
            credit: data.amount,
          }).eq("id", jl.id);
        }
      }
    }

    if (data.branch_id) {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "expense.update", entity_table: "expenses", entity_id: data.id,
        after_data: { expense_no: data.expense_no, amount: data.amount },
      });
    }
    return row;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({ id: z.string().uuid(), branch_id: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { data: existing, error: eFind } = await context.supabase
      .from("expenses")
      .select("id, journal_id, expense_no, amount")
      .eq("tenant_id", data.tenant_id)
      .eq("id", data.id)
      .single();
    if (eFind || !existing) throw new Error("Expense not found");

    const { error } = await context.supabase
      .from("expenses")
      .delete()
      .eq("tenant_id", data.tenant_id)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (existing.journal_id) {
      await context.supabase.from("journal_lines").delete().eq("journal_id", existing.journal_id);
      await context.supabase.from("journal_entries").delete().eq("id", existing.journal_id).eq("tenant_id", data.tenant_id);
    }

    if (data.branch_id) {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "expense.delete", entity_table: "expenses", entity_id: data.id,
        before_data: { expense_no: existing.expense_no, amount: existing.amount },
      });
    }
    return { ok: true };
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
  payment_account_code: z.string().min(1).optional(),
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
        { account_code: data.payment_account_code || cashAccountFor(data.payment_method), debit: data.amount, credit: 0, description: data.source ?? "Receipt" },
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
        income_date: data.income_date ?? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10),
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

export const updateIncome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) => IncomeInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { data: existing, error: eFind } = await context.supabase
      .from("incomes")
      .select("id, journal_id")
      .eq("tenant_id", data.tenant_id)
      .eq("id", data.id)
      .single();
    if (eFind || !existing) throw new Error("Income not found");

    const { data: acc, error: e0 } = await context.supabase
      .from("chart_of_accounts").select("id").eq("tenant_id", data.tenant_id).eq("code", data.account_code).single();
    if (e0 || !acc) throw new Error("Account not found: " + data.account_code);

    const debitCode = data.payment_account_code || cashAccountFor(data.payment_method);
    const { data: payAcc } = await context.supabase
      .from("chart_of_accounts").select("id").eq("tenant_id", data.tenant_id).eq("code", debitCode).maybeSingle();

    const { data: row, error } = await context.supabase
      .from("incomes")
      .update({
        income_no: data.income_no,
        income_date: data.income_date ?? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10),
        account_id: acc.id,
        amount: data.amount,
        payment_method: data.payment_method,
        source: data.source ?? null,
        reference_no: data.reference_no ?? null,
        notes: data.notes ?? null,
      })
      .eq("tenant_id", data.tenant_id)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (existing.journal_id) {
      await context.supabase
        .from("journal_entries")
        .update({ entry_date: data.income_date, notes: data.notes ?? null })
        .eq("id", existing.journal_id)
        .eq("tenant_id", data.tenant_id);

      const { data: jLines } = await context.supabase
        .from("journal_lines")
        .select("id, debit, credit")
        .eq("journal_id", existing.journal_id);

      for (const jl of jLines ?? []) {
        if (Number(jl.debit) > 0) {
          await context.supabase.from("journal_lines").update({
            ...(payAcc?.id ? { account_id: payAcc.id } : {}),
            debit: data.amount,
            description: data.source ?? "Receipt",
          }).eq("id", jl.id);
        } else if (Number(jl.credit) > 0) {
          await context.supabase.from("journal_lines").update({
            account_id: acc.id,
            credit: data.amount,
            description: data.notes ?? null,
          }).eq("id", jl.id);
        }
      }
    }

    if (data.branch_id) {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "income.update", entity_table: "incomes", entity_id: data.id,
        after_data: { income_no: data.income_no, amount: data.amount },
      });
    }
    return row;
  });

export const deleteIncome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({ id: z.string().uuid(), branch_id: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);
    const { data: existing, error: eFind } = await context.supabase
      .from("incomes")
      .select("id, journal_id, income_no, amount")
      .eq("tenant_id", data.tenant_id)
      .eq("id", data.id)
      .single();
    if (eFind || !existing) throw new Error("Income not found");

    const { error } = await context.supabase
      .from("incomes")
      .delete()
      .eq("tenant_id", data.tenant_id)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (existing.journal_id) {
      await context.supabase.from("journal_lines").delete().eq("journal_id", existing.journal_id);
      await context.supabase.from("journal_entries").delete().eq("id", existing.journal_id).eq("tenant_id", data.tenant_id);
    }

    if (data.branch_id) {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "income.delete", entity_table: "incomes", entity_id: data.id,
        before_data: { income_no: existing.income_no, amount: existing.amount },
      });
    }
    return { ok: true };
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

export const getPaymentAccountBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({
      from: z.string().optional(),
      to: z.string().optional(),
      include_inactive: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let qAcc = context.supabase
      .from("chart_of_accounts")
      .select("id, code, name, type, is_active")
      .eq("tenant_id", data.tenant_id)
      .eq("type", "asset")
      .order("code");
    if (!data.include_inactive) {
      qAcc = qAcc.eq("is_active", true);
    }
    const { data: accounts, error: e1 } = await qAcc;
    if (e1) throw new Error(e1.message);

    const cashLike = (accounts ?? []).filter((a) => /^10\d{2}$/.test(a.code));
    if (cashLike.length === 0) return [];

    const ids = cashLike.map((a) => a.id);
    let q = context.supabase
      .from("journal_lines")
      .select("account_id, debit, credit, journal_entries!inner(entry_date)")
      .eq("tenant_id", data.tenant_id)
      .in("account_id", ids);
    if (data.from) q = q.gte("journal_entries.entry_date", data.from);
    if (data.to) q = q.lte("journal_entries.entry_date", data.to);
    const { data: lines, error: e2 } = await q;
    if (e2) throw new Error(e2.message);

    const balMap = new Map<string, number>();
    for (const l of lines ?? []) {
      const prev = balMap.get(l.account_id) ?? 0;
      balMap.set(l.account_id, prev + Number(l.debit ?? 0) - Number(l.credit ?? 0));
    }

    return cashLike.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      is_active: a.is_active,
      balance: Number((balMap.get(a.id) ?? 0).toFixed(2)),
    }));
  });

export const addBankDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      branch_id: z.string().uuid().optional(),
      account_code: z.string().min(1),
      amount: z.number().positive(),
      deposit_date: z.string().optional(),
      notes: z.string().max(400).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);

    const { data: acc, error: e0 } = await context.supabase
      .from("chart_of_accounts").select("id, name").eq("tenant_id", data.tenant_id).eq("code", data.account_code).single();
    if (e0 || !acc) throw new Error("Account not found: " + data.account_code);

    const entryNo = `DEP-${Date.now().toString().slice(-6)}`;
    const dateStr = data.deposit_date || new Date().toISOString().slice(0, 10);
    const desc = data.notes?.trim() || `Balance deposit to ${acc.name}`;

    const { data: je, error: eJ } = await context.supabase.rpc("post_journal", {
      _tenant_id: data.tenant_id,
      _entry_no: entryNo,
      _entry_date: dateStr,
      _notes: desc,
      _ref_table: "chart_of_accounts",
      _ref_id: acc.id,
      _ref_no: entryNo,
      _lines: [
        { account_code: data.account_code, debit: data.amount, credit: 0, description: desc },
        { account_code: "3000", debit: 0, credit: data.amount, description: desc },
      ],
    } as never);
    if (eJ) throw new Error(eJ.message);

    const journalId = (je as { id: string }).id;
    if (data.branch_id) {
      await context.supabase.from("journal_entries").update({ branch_id: data.branch_id }).eq("id", journalId);
      await context.supabase.from("journal_lines").update({ branch_id: data.branch_id }).eq("journal_id", journalId);
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id, branch_id: data.branch_id, user_id: context.userId,
        action: "bank.deposit", entity_table: "chart_of_accounts", entity_id: acc.id,
        after_data: { account_code: data.account_code, amount: data.amount, notes: desc },
      });
    }
    return { ok: true, journalId };
  });

/* ---------------- Day Closing & Cash Reconciliation ---------------- */

const AllocationItem = z.object({
  type: z.enum(["bank_transfer", "owner_drawing", "cash_expense", "owner_injection", "other_income"]),
  account_code: z.string().optional(),
  account_name: z.string().optional(),
  amount: z.number().positive(),
  note: z.string().max(250).optional(),
});

export const getDayClosingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { tenant_id, date } = data;

    // 1. Live Cash on Hand (1000) up to date
    const { data: cashAcc } = await context.supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("code", "1000")
      .maybeSingle();

    let expectedCash = 0;
    if (cashAcc?.id) {
      const { data: jLines } = await context.supabase
        .from("journal_lines")
        .select("debit, credit, journal_entries!inner(entry_date)")
        .eq("tenant_id", tenant_id)
        .eq("account_id", cashAcc.id)
        .lte("journal_entries.entry_date", date);
      for (const l of jLines ?? []) {
        expectedCash += Number(l.debit ?? 0) - Number(l.credit ?? 0);
      }
    }

    // 2. Previous day closing & current day closing record
    const [prevRes, curRes, histRes] = await Promise.all([
      context.supabase
        .from("day_closings" as never)
        .select("closing_date, counted_cash, expected_cash, difference")
        .eq("tenant_id", tenant_id)
        .lt("closing_date", date)
        .order("closing_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from("day_closings" as never)
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("closing_date", date)
        .maybeSingle(),
      context.supabase
        .from("day_closings" as never)
        .select("id, closing_date, opening_cash, expected_cash, counted_cash, difference, allocations, notes, created_at")
        .eq("tenant_id", tenant_id)
        .order("closing_date", { ascending: false })
        .limit(30),
    ]);

    const prevClosing = (prevRes.data ?? null) as { closing_date: string; counted_cash: number; expected_cash: number; difference: number } | null;

    return {
      expectedCash: Number(expectedCash.toFixed(2)),
      prevClosing,
      currentClosing: curRes.data ?? null,
      history: (histRes.data ?? []) as Array<{
        id: string;
        closing_date: string;
        opening_cash: number;
        expected_cash: number;
        counted_cash: number;
        difference: number;
        allocations: Array<{ type: string; account_code?: string; account_name?: string; amount: number; note?: string }>;
        notes: string | null;
        created_at: string;
      }>,
    };
  });

export const closeDayWithReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator((i: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      branch_id: z.string().uuid().optional(),
      closing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      opening_cash: z.number().min(0).default(0),
      expected_cash: z.number(),
      counted_cash: z.number().min(0),
      allocations: z.array(AllocationItem).default([]),
      notes: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.branch_id) await assertBranchWrite(context.supabase, data.tenant_id, data.branch_id);

    const diff = Number((data.counted_cash - data.expected_cash).toFixed(2));
    const absDiff = Math.abs(diff);

    if (absDiff > 0.009) {
      const allocSum = Number(data.allocations.reduce((s, a) => s + Number(a.amount), 0).toFixed(2));
      if (Math.abs(allocSum - absDiff) > 0.01) {
        throw new Error(`হিসাবের গরমিল! পার্থক্য ৳ ${absDiff.toLocaleString("en-IN")} কিন্তু দেওয়া হয়েছে ৳ ${allocSum.toLocaleString("en-IN")}। ১ পয়সাও বাদ না রেখে সম্পূর্ণ হিসাব দিন।`);
      }
    }

    let journalId: string | null = null;
    if (absDiff > 0.009 && data.allocations.length > 0) {
      const lines: Array<{ account_code: string; debit: number; credit: number; description: string }> = [];

      if (diff < 0) {
        // Cash decreased from expected -> Credit 1000, Debit target accounts
        lines.push({
          account_code: "1000",
          debit: 0,
          credit: absDiff,
          description: `Day close cash reconciliation (${data.closing_date})`,
        });
        for (const a of data.allocations) {
          const targetCode =
            a.type === "bank_transfer" ? (a.account_code || "1010") :
            a.type === "cash_expense" ? (a.account_code || "6900") : "3000";
          const desc =
            a.type === "bank_transfer" ? `Cash deposited to ${a.account_name || targetCode}${a.note ? `: ${a.note}` : ""}` :
            a.type === "cash_expense" ? `Day-close expense: ${a.note || a.account_name || targetCode}` :
            `Owner personal withdrawal / drawing${a.note ? `: ${a.note}` : ""}`;
          lines.push({ account_code: targetCode, debit: a.amount, credit: 0, description: desc });

          if (a.type === "cash_expense" && data.branch_id) {
            const { data: expAcc } = await context.supabase
              .from("chart_of_accounts").select("id").eq("tenant_id", data.tenant_id).eq("code", targetCode).maybeSingle();
            if (expAcc?.id) {
              await context.supabase.from("expenses").insert({
                tenant_id: data.tenant_id,
                branch_id: data.branch_id,
                expense_no: `DCL-${data.closing_date.replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`,
                expense_date: data.closing_date,
                account_id: expAcc.id,
                amount: a.amount,
                payment_method: "cash",
                vendor: "Day Close Reconciliation",
                notes: a.note || "Day-close cash expense",
                created_by: context.userId,
              });
            }
          }
        }
      } else {
        // Cash increased above expected -> Debit 1000, Credit Equity / Income
        lines.push({
          account_code: "1000",
          debit: absDiff,
          credit: 0,
          description: `Day close cash surplus (${data.closing_date})`,
        });
        for (const a of data.allocations) {
          const targetCode = a.type === "other_income" ? (a.account_code || "4100") : "3000";
          const desc = a.type === "other_income" ? `Day-close other income: ${a.note || ""}` : `Owner cash injection: ${a.note || ""}`;
          lines.push({ account_code: targetCode, debit: 0, credit: a.amount, description: desc });
        }
      }

      const entryNo = `DCL-${data.closing_date.replace(/-/g, "")}-${Date.now().toString().slice(-4)}`;
      const { data: je, error: eJ } = await context.supabase.rpc("post_journal", {
        _tenant_id: data.tenant_id,
        _entry_no: entryNo,
        _entry_date: data.closing_date,
        _notes: data.notes?.trim() || `Day closing reconciliation (${data.closing_date})`,
        _ref_table: "day_closings",
        _ref_id: null,
        _ref_no: entryNo,
        _lines: lines,
      } as never);
      if (eJ) throw new Error(eJ.message);
      journalId = (je as { id: string }).id;
      if (data.branch_id) {
        await context.supabase.from("journal_entries").update({ branch_id: data.branch_id }).eq("id", journalId);
        await context.supabase.from("journal_lines").update({ branch_id: data.branch_id }).eq("journal_id", journalId);
      }
    }

    const { data: saved, error: eUp } = await context.supabase
      .from("day_closings" as never)
      .upsert(
        {
          tenant_id: data.tenant_id,
          branch_id: data.branch_id ?? null,
          closing_date: data.closing_date,
          opening_cash: data.opening_cash,
          expected_cash: data.expected_cash,
          counted_cash: data.counted_cash,
          difference: diff,
          allocations: data.allocations,
          notes: data.notes?.trim() || null,
          journal_id: journalId,
          closed_by: context.userId,
        } as never,
        { onConflict: "tenant_id,closing_date" },
      )
      .select()
      .single();
    if (eUp) throw new Error(eUp.message);

    if (data.branch_id) {
      await context.supabase.from("audit_log").insert({
        tenant_id: data.tenant_id,
        branch_id: data.branch_id,
        user_id: context.userId,
        action: "day_closing.reconcile",
        entity_table: "day_closings",
        entity_id: (saved as { id: string }).id,
        after_data: {
          closing_date: data.closing_date,
          expected_cash: data.expected_cash,
          counted_cash: data.counted_cash,
          difference: diff,
          allocations: data.allocations,
        },
      });
    }
    return saved;
  });
