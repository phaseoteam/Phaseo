"use client";

// components/(gateway)/auth/sign-up/SignUp.tsx
import { useState } from "react";
import OAuthButtons from "./OAuthButtons";
import EmailPassword from "./EmailPassword";

export function SignUp({ returnUrl }: { returnUrl?: string }) {
	const [emailFlowActive, setEmailFlowActive] = useState(false);

	return (
		<div className={`flex flex-col transition-[gap] duration-500 ease-out ${emailFlowActive ? "gap-3" : "gap-6"}`}>
			<div className="flex flex-col items-center gap-2 text-center">
				<h1 className="text-2xl font-bold">Welcome to AI Stats</h1>
			</div>

			<div
				className={`grid origin-top transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${emailFlowActive ? "pointer-events-none grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
				aria-hidden={emailFlowActive}
			>
				<div className="overflow-hidden">
					<OAuthButtons returnUrl={returnUrl} />
				</div>
			</div>

			<EmailPassword
				onEmailFlowChange={setEmailFlowActive}
				returnUrl={returnUrl}
			/>
		</div>
	);
}
