// components/(gateway)/auth/sign-up/SignUp.tsx
import OAuthButtons from "./OAuthButtons";
import EmailPassword from "./EmailPassword";

export async function SignUp() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col items-center gap-2 text-center">
				<h1 className="text-2xl font-bold">Welcome to AI Stats</h1>
			</div>

			<OAuthButtons />
			<EmailPassword />
		</div>
	);
}
