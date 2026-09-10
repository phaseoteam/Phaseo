import path from "node:path";
import * as dotenv from "dotenv";
import { createAdminClient } from "../../src/utils/supabase/admin";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

export function client() {
	return createAdminClient();
}
