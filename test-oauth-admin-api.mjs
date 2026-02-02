#!/usr/bin/env node
/**
 * Test OAuth Admin API Access
 *
 * This script verifies that programmatic OAuth client management works
 * with your Supabase project.
 *
 * Usage:
 *   SUPABASE_URL=https://your-project.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
 *   node test-oauth-admin-api.mjs
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing environment variables');
  console.error('   Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

console.log('🔍 Testing OAuth Admin API access...\n');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function testOAuthAdminAPI() {
  try {
    // Test 1: List OAuth clients (should work even if empty)
    console.log('1️⃣ Testing listClients()...');
    const { data: clients, error: listError } = await supabase.auth.admin.oauth.listClients();

    if (listError) {
      console.error('   ❌ Failed to list OAuth clients');
      console.error('   Error:', listError.message);
      console.error('\n💡 Possible causes:');
      console.error('   - OAuth 2.1 server not enabled in dashboard');
      console.error('   - Dynamic client registration disabled');
      console.error('   - Invalid service role key');
      return false;
    }

    console.log(`   ✅ Success! Found ${clients?.length || 0} OAuth clients`);

    // Test 2: Create a test OAuth client
    console.log('\n2️⃣ Testing createClient()...');
    const testClientName = `Test OAuth App ${Date.now()}`;
    const { data: newClient, error: createError } = await supabase.auth.admin.oauth.createClient({
      name: testClientName,
      redirect_uris: ['https://example.com/callback'],
    });

    if (createError) {
      console.error('   ❌ Failed to create OAuth client');
      console.error('   Error:', createError.message);
      console.error('\n💡 Possible causes:');
      console.error('   - Dynamic client registration not enabled');
      console.error('   - Missing permissions on service role key');
      console.error('   - OAuth Admin API feature not available');
      return false;
    }

    console.log(`   ✅ Success! Created client: ${newClient.client_id}`);
    console.log(`   Client Name: ${testClientName}`);
    console.log(`   Client Secret: ${newClient.client_secret.substring(0, 20)}...`);

    // Test 3: Delete the test client (cleanup)
    console.log('\n3️⃣ Testing deleteClient() (cleanup)...');
    const { error: deleteError } = await supabase.auth.admin.oauth.deleteClient(newClient.client_id);

    if (deleteError) {
      console.error('   ❌ Failed to delete test client');
      console.error('   Error:', deleteError.message);
      console.error(`   ⚠️  Please manually delete client: ${newClient.client_id}`);
      return false;
    }

    console.log(`   ✅ Success! Deleted test client`);

    // All tests passed
    console.log('\n✅ All tests passed! OAuth Admin API is fully functional.');
    console.log('\n📋 Next steps:');
    console.log('   1. Run database migration: supabase db push');
    console.log('   2. Set SUPABASE_SERVICE_ROLE_KEY in production');
    console.log('   3. Deploy your application');
    return true;

  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    console.error('\nFull error:', error);
    return false;
  }
}

// Run the test
testOAuthAdminAPI()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
