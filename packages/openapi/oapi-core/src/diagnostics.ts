export type DiagnosticLevel = "error" | "warn";

export type Diagnostic = {
	level: DiagnosticLevel;
	code: string;
	message: string;
	pointer?: string;
};

export type DiagnosticCollector = {
	diagnostics: Diagnostic[];
	error: (code: string, message: string, pointer?: string) => void;
	warn: (code: string, message: string, pointer?: string) => void;
};

export function createDiagnosticCollector(): DiagnosticCollector {
	const diagnostics: Diagnostic[] = [];
	return {
		diagnostics,
		error(code, message, pointer) {
			diagnostics.push({ level: "error", code, message, pointer });
		},
		warn(code, message, pointer) {
			diagnostics.push({ level: "warn", code, message, pointer });
		}
	};
}
