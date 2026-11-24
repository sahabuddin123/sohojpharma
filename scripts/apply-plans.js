const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'CHANGE_ME_SERVICE_ROLE_KEY';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log("Checking current plans...");
  const { data: currentPlans, error: err } = await sb.from('plans').select('*');
  if (err) {
    console.error("Error reading plans:", err);
    process.exit(1);
  }
  console.log("Current plans count:", currentPlans.length);

  // 1. Update trial_days to 7 for all existing plans
  await sb.from('plans').update({ trial_days: 7 }).neq('id', '00000000-0000-0000-0000-000000000000');

  // 2. Check if basic exists
  const basic = currentPlans.find(p => p.code === 'basic');
  if (basic) {
    console.log("Updating basic plan...");
    await sb.from('plans').update({
      name: 'Basic',
      price_bdt: 999.00,
      price_yearly_bdt: 9990.00,
      trial_days: 7,
      sort_order: 10,
      max_branches: 1,
      max_users: 2,
      max_products: 50000,
      is_active: true,
      features: { pos: true, inventory: true, basic_reports: true, email_support: true }
    }).eq('id', basic.id);
  } else {
    console.log("Inserting basic plan...");
    await sb.from('plans').insert({
      id: 'a1111111-1111-4000-8000-000000000001',
      code: 'basic',
      slug: 'basic',
      name: 'Basic',
      price_bdt: 999.00,
      price_yearly_bdt: 9990.00,
      trial_days: 7,
      sort_order: 10,
      max_branches: 1,
      max_users: 2,
      max_products: 50000,
      is_active: true,
      billing_interval: 'monthly',
      features: { pos: true, inventory: true, basic_reports: true, email_support: true },
      payment_methods: ["bkash", "nagad", "rocket", "bank", "cash"]
    });
  }

  // 3. Starter plan (1499)
  const starter = currentPlans.find(p => p.code === 'starter');
  if (starter) {
    console.log("Updating starter plan...");
    await sb.from('plans').update({
      name: 'Starter',
      price_bdt: 1499.00,
      price_yearly_bdt: 14990.00,
      trial_days: 7,
      sort_order: 20,
      max_branches: 2,
      max_users: 5,
      max_products: 50000,
      is_active: true,
      features: { pos: true, inventory: true, purchase: true, basic_accounts: true, phone_support: true }
    }).eq('id', starter.id);
  }

  // 4. Business plan (2499) - update pro/professional or insert business
  const business = currentPlans.find(p => p.code === 'business');
  const pro = currentPlans.find(p => p.code === 'pro' || p.code === 'professional');
  if (business) {
    console.log("Updating business plan...");
    await sb.from('plans').update({
      name: 'Business',
      price_bdt: 2499.00,
      price_yearly_bdt: 24990.00,
      trial_days: 7,
      sort_order: 30,
      max_branches: 5,
      max_users: 15,
      max_products: 100000,
      is_active: true,
      features: { pos: true, inventory: true, all_modules: true, advanced_reports: true, priority_support: true, whatsapp_support: true }
    }).eq('id', business.id);
  } else if (pro) {
    console.log("Updating pro to business plan...");
    await sb.from('plans').update({
      name: 'Business',
      code: 'business',
      slug: 'business',
      price_bdt: 2499.00,
      price_yearly_bdt: 24990.00,
      trial_days: 7,
      sort_order: 30,
      max_branches: 5,
      max_users: 15,
      max_products: 100000,
      is_active: true,
      features: { pos: true, inventory: true, all_modules: true, advanced_reports: true, priority_support: true, whatsapp_support: true }
    }).eq('id', pro.id);
  } else {
    console.log("Inserting business plan...");
    await sb.from('plans').insert({
      id: 'a2222222-2222-4000-8000-000000000002',
      code: 'business',
      slug: 'business',
      name: 'Business',
      price_bdt: 2499.00,
      price_yearly_bdt: 24990.00,
      trial_days: 7,
      sort_order: 30,
      max_branches: 5,
      max_users: 15,
      max_products: 100000,
      is_active: true,
      billing_interval: 'monthly',
      features: { pos: true, inventory: true, all_modules: true, advanced_reports: true, priority_support: true, whatsapp_support: true },
      payment_methods: ["bkash", "nagad", "rocket", "bank", "cash"]
    });
  }

  // 5. Enterprise plan (Custom / 0)
  const enterprise = currentPlans.find(p => p.code === 'enterprise');
  if (enterprise) {
    console.log("Updating enterprise plan...");
    await sb.from('plans').update({
      name: 'Enterprise',
      price_bdt: 0.00,
      price_yearly_bdt: 0.00,
      trial_days: 7,
      sort_order: 40,
      max_branches: 999,
      max_users: 999,
      max_products: 500000,
      is_unlimited: true,
      is_active: true,
      features: { pos: true, inventory: true, all_modules: true, unlimited_branches: true, unlimited_users: true, api_access: true, dedicated_manager: true, custom_support: true }
    }).eq('id', enterprise.id);
  }

  // 6. Free plan
  const free = currentPlans.find(p => p.code === 'free');
  if (free) {
    console.log("Updating free plan...");
    await sb.from('plans').update({
      trial_days: 7,
      sort_order: 5,
      max_products: 50000
    }).eq('id', free.id);
  }

  console.log("Fetching updated plans...");
  const { data: updatedPlans } = await sb.from('plans').select('id,code,name,price_bdt,price_yearly_bdt,trial_days,sort_order').order('sort_order');
  console.log("Updated Plans:", JSON.stringify(updatedPlans, null, 2));
  process.exit(0);
}

run().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
