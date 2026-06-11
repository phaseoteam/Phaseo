import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export type InternalAuthStatus = {
	isAdmin: boolean;
	signedIn: boolean;
};

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.id) {
		return NextResponse.json({
			isAdmin: false,
			signedIn: false,
		} satisfies InternalAuthStatus);
	}

	const { data: userData } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();

	return NextResponse.json({
		isAdmin: userData?.role === "admin",
		signedIn: true,
	} satisfies InternalAuthStatus);
}
