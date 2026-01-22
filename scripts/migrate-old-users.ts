/**
 * Migrate Old Users to Merchant Members
 * 
 * This script migrates existing users (who have profiles but no merchant_members records)
 * to a specified default merchant.
 * 
 * Usage:
 * ```bash
 * # Set environment variables
 * SUPABASE_URL=https://your-project.supabase.co \
 * SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
 * DEFAULT_MERCHANT_ID=your_merchant_id \
 * pnpm tsx scripts/migrate-old-users.ts
 * ```
 * 
 * Or use a .env file:
 * ```
 * SUPABASE_URL=https://your-project.supabase.co
 * SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
 * DEFAULT_MERCHANT_ID=your_merchant_id
 * ```
 */

import { createClient } from '@supabase/supabase-js';

// Load environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_MERCHANT_ID = process.env.DEFAULT_MERCHANT_ID;
const DEFAULT_ROLE = process.env.DEFAULT_ROLE || 'staff';

// Validate environment variables
if (!SUPABASE_URL) {
  console.error('❌ Missing SUPABASE_URL environment variable');
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

if (!DEFAULT_MERCHANT_ID) {
  console.error('❌ Missing DEFAULT_MERCHANT_ID environment variable');
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: Array<{ email: string; error: string }>;
}

async function migrateOldUsers(): Promise<MigrationResult> {
  console.log('========================================');
  console.log('🚀 Starting Old Users Migration');
  console.log('========================================');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Default Merchant ID: ${DEFAULT_MERCHANT_ID}`);
  console.log(`Default Role: ${DEFAULT_ROLE}`);
  console.log('========================================\n');

  const result: MigrationResult = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 1. Verify the default merchant exists
    console.log('📋 Step 1: Verifying default merchant...');
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, name')
      .eq('id', DEFAULT_MERCHANT_ID)
      .single();

    if (merchantError || !merchant) {
      console.error('❌ Default merchant not found:', merchantError?.message);
      console.error('   Please ensure the merchant ID is correct.');
      return result;
    }

    console.log(`✅ Found merchant: ${merchant.name} (${merchant.id})\n`);

    // 2. Fetch all profiles
    console.log('📋 Step 2: Fetching all user profiles...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, display_name, created_at')
      .order('created_at', { ascending: true });

    if (profilesError) {
      console.error('❌ Failed to fetch profiles:', profilesError.message);
      return result;
    }

    if (!profiles || profiles.length === 0) {
      console.log('⚠️  No profiles found in the database.');
      return result;
    }

    result.total = profiles.length;
    console.log(`✅ Found ${result.total} profiles\n`);

    // 3. Migrate each profile
    console.log('📋 Step 3: Migrating users...');
    console.log('----------------------------------------');

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const displayName = profile.display_name || profile.email || 'Unknown';
      const progress = `[${i + 1}/${result.total}]`;

      console.log(`${progress} Processing: ${displayName}`);

      // Check if user already has membership
      const { data: existingMembership, error: membershipCheckError } = await supabase
        .from('merchant_members')
        .select('id, role')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (membershipCheckError) {
        console.error(`  ❌ Error checking membership:`, membershipCheckError.message);
        result.failed++;
        result.errors.push({
          email: profile.email || profile.id,
          error: `Membership check failed: ${membershipCheckError.message}`,
        });
        continue;
      }

      if (existingMembership) {
        console.log(`  ⏭️  Skipped - already has membership (role: ${existingMembership.role})`);
        result.skipped++;
        continue;
      }

      // Create merchant_member record
      const { error: insertError } = await supabase
        .from('merchant_members')
        .insert({
          merchant_id: DEFAULT_MERCHANT_ID,
          user_id: profile.id,
          role: DEFAULT_ROLE,
          is_active: true,
        });

      if (insertError) {
        console.error(`  ❌ Migration failed:`, insertError.message);
        result.failed++;
        result.errors.push({
          email: profile.email || profile.id,
          error: `Insert failed: ${insertError.message}`,
        });
      } else {
        console.log(`  ✅ Migrated successfully (role: ${DEFAULT_ROLE})`);
        result.migrated++;
      }
    }

    console.log('----------------------------------------\n');

  } catch (error: any) {
    console.error('❌ Unexpected error during migration:', error.message);
    console.error(error.stack);
  }

  return result;
}

// Main execution
async function main() {
  const startTime = Date.now();
  
  const result = await migrateOldUsers();
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Print summary
  console.log('========================================');
  console.log('📊 Migration Summary');
  console.log('========================================');
  console.log(`Total profiles:     ${result.total}`);
  console.log(`✅ Migrated:        ${result.migrated}`);
  console.log(`⏭️  Skipped:         ${result.skipped}`);
  console.log(`❌ Failed:          ${result.failed}`);
  console.log(`⏱️  Duration:        ${duration}s`);
  console.log('========================================');

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach((err, index) => {
      console.log(`${index + 1}. ${err.email}: ${err.error}`);
    });
  }

  if (result.failed > 0) {
    console.log('\n⚠️  Some migrations failed. Please check the errors above.');
    process.exit(1);
  }

  console.log('\n✅ Migration completed successfully!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
