export default function Hero() {
	return (
		<header className="relative mx-12 pb-12 pt-8">
			<div className="space-y-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-900 p-8 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">
				<h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 bg-clip-text text-transparent animate-pulse">
					Your AI Stats Wrapped, One Prompt at a Time.
				</h1>
				<p className="text-lg text-zinc-600 dark:text-zinc-300 leading-relaxed">
					Upload exports from your favorite AI copilots and watch them
					transform into a Spotify Wrapped-style story. Everything
					runs in your browser -- your data never leaves the page.
				</p>
			</div>
		</header>
	);
}
