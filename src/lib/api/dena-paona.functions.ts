import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizePostgrestSearch } from "@/lib/security/postgrest";

const TenantInput = z.object({ tenantId: z.string().uuid() });

export const getDenaPaonaList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    TenantInput.extend({
      search: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    let query = supabase
      .from("dena_paona")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false });

    const safeSearch = sanitizePostgrestSearch(data.search);
    if (safeSearch) {
      const q = `%${safeSearch}%`;
      query = query.or(`person_name.ilike.${q},phone.ilike.${q},address.ilike.${q}`);
    }

    const { data: records, error } = await query;
    if (error) throw new Error(error.message);

    const all = records || [];
    const givingList = all.filter((r) => r.type === "give");
    const takingList = all.filter((r) => r.type === "take");

    const givingSummary = {
      totalGiven: givingList.reduce((acc, r) => acc + Number(r.total_amount || 0), 0),
      totalRemaining: givingList.reduce((acc, r) => acc + Number(r.remaining_amount || 0), 0),
      count: givingList.length,
    };

    const takingSummary = {
      totalTaken: takingList.reduce((acc, r) => acc + Number(r.total_amount || 0), 0),
      totalRemaining: takingList.reduce((acc, r) => acc + Number(r.remaining_amount || 0), 0),
      count: takingList.length,
    };

    return {
      givingList,
      takingList,
      givingSummary,
      takingSummary,
    };
  });

export const createDenaPaonaEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    TenantInput.extend({
      type: z.enum(["give", "take"]),
      person_name: z.string().min(1, "নাম আবশ্যক"),
      phone: z.string().min(1, "ফোন নম্বর আবশ্যক"),
      address: z.string().optional(),
      amount: z.number().positive("টাকার পরিমাণ ধনাত্মক হতে হবে"),
      transaction_date: z.string(),
      repayment_date: z.string().optional(),
      witness_1: z.string().min(1, "সাক্ষী ১ আবশ্যক"),
      witness_2: z.string().min(1, "সাক্ষী ২ আবশ্যক"),
      reason: z.string().min(1, "লেনদেনের কারণ আবশ্যক"),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    // 1. Insert parent dena_paona entry
    const { data: entry, error: entryErr } = await supabase
      .from("dena_paona")
      .insert({
        tenant_id: data.tenantId,
        type: data.type,
        person_name: data.person_name,
        phone: data.phone,
        address: data.address || null,
        transaction_date: data.transaction_date,
        repayment_date: data.repayment_date || null,
        witness_1: data.witness_1,
        witness_2: data.witness_2,
        reason: data.reason,
        total_amount: data.amount,
        paid_amount: 0,
        remaining_amount: data.amount,
        status: "active",
      })
      .select("id")
      .single();

    if (entryErr || !entry) {
      throw new Error(entryErr?.message || "হিসাব তৈরি করতে সমস্যা হয়েছে");
    }

    // 2. Insert initial transaction row
    const { error: txErr } = await supabase.from("dena_paona_transactions").insert({
      tenant_id: data.tenantId,
      dena_paona_id: entry.id,
      type: "initial",
      transaction_date: data.transaction_date,
      description: data.reason,
      given_amount: data.type === "give" ? data.amount : 0,
      taken_amount: data.type === "take" ? data.amount : 0,
      paid_amount: 0,
      remaining_amount: data.amount,
      next_payment_date: data.repayment_date || null,
    });

    if (txErr) {
      console.error("[DenaPaona] initial transaction error:", txErr);
    }

    return { id: entry.id };
  });

export const getDenaPaonaDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    TenantInput.extend({
      id: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: loan, error: loanErr } = await supabase
      .from("dena_paona")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("id", data.id)
      .single();

    if (loanErr || !loan) {
      throw new Error(loanErr?.message || "হিসাব পাওয়া যায়নি");
    }

    const { data: transactions, error: txErr } = await supabase
      .from("dena_paona_transactions")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("dena_paona_id", data.id)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (txErr) {
      throw new Error(txErr.message);
    }

    return {
      loan,
      transactions: transactions || [],
    };
  });

export const addDenaPaonaTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    TenantInput.extend({
      loanId: z.string().uuid(),
      actionType: z.enum(["repayment", "more"]),
      amount: z.number().positive("টাকার পরিমাণ ধনাত্মক হতে হবে"),
      nextPaymentDate: z.string().optional(),
      description: z.string().optional(),
      transactionDate: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    // Fetch existing loan
    const { data: loan, error: fetchErr } = await supabase
      .from("dena_paona")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("id", data.loanId)
      .single();

    if (fetchErr || !loan) {
      throw new Error("ঋণ হিসাব পাওয়া যায়নি");
    }

    let newTotal = Number(loan.total_amount || 0);
    let newPaid = Number(loan.paid_amount || 0);
    let newRemaining = Number(loan.remaining_amount || 0);
    let txType: "repayment" | "give_more" | "take_more";
    let givenAmt = 0;
    let takenAmt = 0;
    let paidAmt = 0;

    if (data.actionType === "repayment") {
      txType = "repayment";
      paidAmt = data.amount;
      newPaid += data.amount;
      newRemaining = Math.max(0, newRemaining - data.amount);
    } else {
      // Adding more loan
      if (loan.type === "give") {
        txType = "give_more";
        givenAmt = data.amount;
      } else {
        txType = "take_more";
        takenAmt = data.amount;
      }
      newTotal += data.amount;
      newRemaining += data.amount;
    }

    const txDate = data.transactionDate || new Date().toISOString().slice(0, 10);

    // Update parent
    const { error: updateErr } = await supabase
      .from("dena_paona")
      .update({
        total_amount: newTotal,
        paid_amount: newPaid,
        remaining_amount: newRemaining,
        repayment_date: data.nextPaymentDate || loan.repayment_date,
        status: newRemaining === 0 ? "settled" : "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.loanId);

    if (updateErr) {
      throw new Error("হিসাব আপডেট করতে সমস্যা হয়েছে: " + updateErr.message);
    }

    // Insert transaction
    const { error: txErr } = await supabase.from("dena_paona_transactions").insert({
      tenant_id: data.tenantId,
      dena_paona_id: data.loanId,
      type: txType,
      transaction_date: txDate,
      description: data.description || (data.actionType === "repayment" ? "ঋণ পরিশোধ" : "নতুন লেনদেন"),
      given_amount: givenAmt,
      taken_amount: takenAmt,
      paid_amount: paidAmt,
      remaining_amount: newRemaining,
      next_payment_date: data.nextPaymentDate || null,
    });

    if (txErr) {
      throw new Error("লেনদেন রেকর্ড করতে সমস্যা হয়েছে: " + txErr.message);
    }

    return {
      success: true,
      remaining: newRemaining,
    };
  });

export const deleteDenaPaona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    TenantInput.extend({
      id: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { error } = await supabase
      .from("dena_paona")
      .delete()
      .eq("tenant_id", data.tenantId)
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
