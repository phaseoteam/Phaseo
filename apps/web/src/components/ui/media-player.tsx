"use client";

import * as React from "react";
import {
	Captions,
	Download,
	Loader2,
	Maximize,
	Minimize,
	MonitorUp,
	Pause,
	PictureInPicture,
	Play,
	Repeat,
	Settings2,
	SkipBack,
	SkipForward,
	Volume2,
	VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type MediaKind = "video" | "audio";

type MediaPlayerRootProps = React.HTMLAttributes<HTMLDivElement> & {
	src?: string;
	poster?: string;
	autoPlay?: boolean;
	muted?: boolean;
	loop?: boolean;
};

type MediaPlayerContextValue = {
	rootRef: React.RefObject<HTMLDivElement | null>;
	mediaElement: HTMLMediaElement | null;
	setMediaElement: (element: HTMLMediaElement | null) => void;
	setMediaKind: (kind: MediaKind) => void;
	mediaKind: MediaKind;
	playing: boolean;
	loading: boolean;
	error: string | null;
	currentTime: number;
	duration: number;
	buffered: number;
	volume: number;
	muted: boolean;
	playbackRate: number;
	loop: boolean;
	isFullscreen: boolean;
	isPiP: boolean;
	captionsEnabled: boolean;
	volumeIndicatorVisible: boolean;
	togglePlay: () => void;
	seekBy: (seconds: number) => void;
	seekTo: (seconds: number) => void;
	setVolume: (value: number) => void;
	toggleMute: () => void;
	setPlaybackRate: (value: number) => void;
	toggleLoop: () => void;
	toggleFullscreen: () => void;
	togglePiP: () => void;
	toggleCaptions: () => void;
};

const MediaPlayerContext = React.createContext<MediaPlayerContextValue | null>(
	null,
);

function useMediaPlayer() {
	const context = React.useContext(MediaPlayerContext);
	if (!context) {
		throw new Error("MediaPlayer components must be used within <MediaPlayer>.");
	}
	return context;
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
	return (value: T) => {
		for (const ref of refs) {
			if (!ref) continue;
			if (typeof ref === "function") {
				ref(value);
				continue;
			}
			(ref as React.MutableRefObject<T | null>).current = value;
		}
	};
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function formatTime(totalSeconds: number) {
	if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
	const seconds = Math.floor(totalSeconds);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainingSeconds = seconds % 60;
	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(
			remainingSeconds,
		).padStart(2, "0")}`;
	}
	return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

const controlButtonClass =
	"h-8 w-8 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white/40";

const MediaPlayerRoot = React.forwardRef<HTMLDivElement, MediaPlayerRootProps>(
	function MediaPlayerRoot(
		{
			className,
			children,
			src,
			poster,
			autoPlay = false,
			muted: mutedProp = false,
			loop: loopProp = false,
			...props
		},
		ref,
	) {
		const rootRef = React.useRef<HTMLDivElement | null>(null);
		const [mediaElement, setMediaElement] = React.useState<HTMLMediaElement | null>(
			null,
		);
		const [mediaKind, setMediaKind] = React.useState<MediaKind>("video");
		const [playing, setPlaying] = React.useState(false);
		const [loading, setLoading] = React.useState(Boolean(autoPlay));
		const [error, setError] = React.useState<string | null>(null);
		const [currentTime, setCurrentTime] = React.useState(0);
		const [duration, setDuration] = React.useState(0);
		const [buffered, setBuffered] = React.useState(0);
		const [volume, setVolumeState] = React.useState(mutedProp ? 0 : 1);
		const [muted, setMuted] = React.useState(mutedProp);
		const [playbackRate, setPlaybackRateState] = React.useState(1);
		const [loop, setLoop] = React.useState(loopProp);
		const [isFullscreen, setIsFullscreen] = React.useState(false);
		const [isPiP, setIsPiP] = React.useState(false);
		const [captionsEnabled, setCaptionsEnabled] = React.useState(false);
		const [volumeIndicatorVisible, setVolumeIndicatorVisible] = React.useState(false);
		const volumeIndicatorTimerRef = React.useRef<number | null>(null);

		React.useEffect(() => {
			const root = rootRef.current;
			if (!root) return;
			const onFullscreenChange = () => {
				setIsFullscreen(document.fullscreenElement === root);
			};
			document.addEventListener("fullscreenchange", onFullscreenChange);
			return () => {
				document.removeEventListener("fullscreenchange", onFullscreenChange);
			};
		}, []);

		React.useEffect(() => {
			if (!mediaElement) return;

			const syncState = () => {
				setCurrentTime(mediaElement.currentTime || 0);
				setDuration(mediaElement.duration || 0);
				setVolumeState(mediaElement.volume);
				setMuted(mediaElement.muted);
				setPlaybackRateState(mediaElement.playbackRate);
				setLoop(mediaElement.loop);
				setPlaying(!mediaElement.paused && !mediaElement.ended);
			};

			const onTimeUpdate = () => setCurrentTime(mediaElement.currentTime || 0);
			const onDurationChange = () => setDuration(mediaElement.duration || 0);
			const onProgress = () => {
				try {
					const rangeCount = mediaElement.buffered.length;
					if (!rangeCount) {
						setBuffered(0);
						return;
					}
					const end = mediaElement.buffered.end(rangeCount - 1);
					setBuffered(end);
				} catch {
					setBuffered(0);
				}
			};
			const onPlay = () => setPlaying(true);
			const onPause = () => setPlaying(false);
			const onWaiting = () => setLoading(true);
			const onCanPlay = () => setLoading(false);
			const onLoadedData = () => setLoading(false);
			const onRateChange = () => setPlaybackRateState(mediaElement.playbackRate);
			const onVolumeChange = () => {
				setVolumeState(mediaElement.volume);
				setMuted(mediaElement.muted);
				if (volumeIndicatorTimerRef.current) {
					window.clearTimeout(volumeIndicatorTimerRef.current);
				}
				setVolumeIndicatorVisible(true);
				volumeIndicatorTimerRef.current = window.setTimeout(() => {
					setVolumeIndicatorVisible(false);
				}, 900);
			};
			const onError = () => {
				const code = (mediaElement as HTMLMediaElement).error?.code;
				const message =
					typeof code === "number"
						? `Playback error (${code})`
						: "Unable to load media";
				setError(message);
				setLoading(false);
			};
			const onEnterPiP = () => setIsPiP(true);
			const onLeavePiP = () => setIsPiP(false);

			mediaElement.addEventListener("timeupdate", onTimeUpdate);
			mediaElement.addEventListener("durationchange", onDurationChange);
			mediaElement.addEventListener("progress", onProgress);
			mediaElement.addEventListener("play", onPlay);
			mediaElement.addEventListener("pause", onPause);
			mediaElement.addEventListener("waiting", onWaiting);
			mediaElement.addEventListener("canplay", onCanPlay);
			mediaElement.addEventListener("loadeddata", onLoadedData);
			mediaElement.addEventListener("ratechange", onRateChange);
			mediaElement.addEventListener("volumechange", onVolumeChange);
			mediaElement.addEventListener("error", onError);
			mediaElement.addEventListener("enterpictureinpicture", onEnterPiP);
			mediaElement.addEventListener("leavepictureinpicture", onLeavePiP);

			mediaElement.muted = mutedProp;
			mediaElement.loop = loopProp;
			syncState();

			return () => {
				mediaElement.removeEventListener("timeupdate", onTimeUpdate);
				mediaElement.removeEventListener("durationchange", onDurationChange);
				mediaElement.removeEventListener("progress", onProgress);
				mediaElement.removeEventListener("play", onPlay);
				mediaElement.removeEventListener("pause", onPause);
				mediaElement.removeEventListener("waiting", onWaiting);
				mediaElement.removeEventListener("canplay", onCanPlay);
				mediaElement.removeEventListener("loadeddata", onLoadedData);
				mediaElement.removeEventListener("ratechange", onRateChange);
				mediaElement.removeEventListener("volumechange", onVolumeChange);
				mediaElement.removeEventListener("error", onError);
				mediaElement.removeEventListener("enterpictureinpicture", onEnterPiP);
				mediaElement.removeEventListener("leavepictureinpicture", onLeavePiP);
			};
		}, [mediaElement, mutedProp, loopProp]);

		React.useEffect(() => {
			return () => {
				if (volumeIndicatorTimerRef.current) {
					window.clearTimeout(volumeIndicatorTimerRef.current);
				}
			};
		}, []);

		const togglePlay = React.useCallback(() => {
			if (!mediaElement) return;
			if (mediaElement.paused) {
				void mediaElement.play().catch(() => {
					// Some browsers block autoplay interactions.
				});
				return;
			}
			mediaElement.pause();
		}, [mediaElement]);

		const seekBy = React.useCallback(
			(seconds: number) => {
				if (!mediaElement) return;
				const target = clamp(mediaElement.currentTime + seconds, 0, duration || 0);
				mediaElement.currentTime = target;
				setCurrentTime(target);
			},
			[mediaElement, duration],
		);

		const seekTo = React.useCallback(
			(seconds: number) => {
				if (!mediaElement) return;
				const target = clamp(seconds, 0, duration || 0);
				mediaElement.currentTime = target;
				setCurrentTime(target);
			},
			[mediaElement, duration],
		);

		const setVolume = React.useCallback(
			(value: number) => {
				if (!mediaElement) return;
				const safeValue = clamp(value, 0, 1);
				mediaElement.volume = safeValue;
				mediaElement.muted = safeValue === 0;
				setVolumeState(safeValue);
				setMuted(mediaElement.muted);
			},
			[mediaElement],
		);

		const toggleMute = React.useCallback(() => {
			if (!mediaElement) return;
			mediaElement.muted = !mediaElement.muted;
			setMuted(mediaElement.muted);
		}, [mediaElement]);

		const setPlaybackRate = React.useCallback(
			(value: number) => {
				if (!mediaElement) return;
				mediaElement.playbackRate = value;
				setPlaybackRateState(value);
			},
			[mediaElement],
		);

		const toggleLoop = React.useCallback(() => {
			if (!mediaElement) return;
			mediaElement.loop = !mediaElement.loop;
			setLoop(mediaElement.loop);
		}, [mediaElement]);

		const toggleFullscreen = React.useCallback(() => {
			const root = rootRef.current;
			if (!root) return;
			if (document.fullscreenElement === root) {
				void document.exitFullscreen().catch(() => {
					// Ignore if browser blocks request.
				});
				return;
			}
			void root.requestFullscreen().catch(() => {
				// Ignore if browser blocks request.
			});
		}, []);

		const togglePiP = React.useCallback(() => {
			if (!mediaElement || mediaKind !== "video") return;
			const video = mediaElement as HTMLVideoElement;
			if (typeof video.requestPictureInPicture !== "function") return;
			if (document.pictureInPictureElement === video) {
				void document.exitPictureInPicture().catch(() => {
					// Ignore.
				});
				return;
			}
			void video.requestPictureInPicture().catch(() => {
				// Ignore.
			});
		}, [mediaElement, mediaKind]);

		const toggleCaptions = React.useCallback(() => {
			if (!mediaElement || mediaKind !== "video") return;
			const video = mediaElement as HTMLVideoElement;
			const tracks = Array.from(video.textTracks);
			if (!tracks.length) return;
			const nextEnabled = !captionsEnabled;
			for (const track of tracks) {
				track.mode = nextEnabled ? "showing" : "hidden";
			}
			setCaptionsEnabled(nextEnabled);
		}, [mediaElement, mediaKind, captionsEnabled]);

		const contextValue = React.useMemo<MediaPlayerContextValue>(
			() => ({
				rootRef,
				mediaElement,
				setMediaElement,
				setMediaKind,
				mediaKind,
				playing,
				loading,
				error,
				currentTime,
				duration,
				buffered,
				volume,
				muted,
				playbackRate,
				loop,
				isFullscreen,
				isPiP,
				captionsEnabled,
				volumeIndicatorVisible,
				togglePlay,
				seekBy,
				seekTo,
				setVolume,
				toggleMute,
				setPlaybackRate,
				toggleLoop,
				toggleFullscreen,
				togglePiP,
				toggleCaptions,
			}),
			[
				mediaElement,
				mediaKind,
				playing,
				loading,
				error,
				currentTime,
				duration,
				buffered,
				volume,
				muted,
				playbackRate,
				loop,
				isFullscreen,
				isPiP,
				captionsEnabled,
				volumeIndicatorVisible,
				togglePlay,
				seekBy,
				seekTo,
				setVolume,
				toggleMute,
				setPlaybackRate,
				toggleLoop,
				toggleFullscreen,
				togglePiP,
				toggleCaptions,
			],
		);

		const hasCustomChildren = React.Children.count(children) > 0;

		return (
			<MediaPlayerContext.Provider value={contextValue}>
				<div
					ref={mergeRefs(ref, rootRef)}
					className={cn(
						"group relative overflow-hidden rounded-xl border border-border bg-black text-white",
						className,
					)}
					{...props}
				>
					{hasCustomChildren ? (
						children
					) : (
						<video
							src={src}
							poster={poster}
							autoPlay={autoPlay}
							muted={mutedProp}
							loop={loopProp}
							playsInline
							controls
							preload="metadata"
							ref={(node) => {
								setMediaKind("video");
								setMediaElement(node);
							}}
							className="h-full w-full max-h-[72vh] object-contain"
						>
							Your browser does not support the video tag.
						</video>
					)}
				</div>
			</MediaPlayerContext.Provider>
		);
	},
);

const MediaPlayerVideo = React.forwardRef<
	HTMLVideoElement,
	React.VideoHTMLAttributes<HTMLVideoElement>
>(function MediaPlayerVideo({ className, ...props }, ref) {
	const { setMediaElement, setMediaKind } = useMediaPlayer();
	return (
		<video
			ref={mergeRefs(ref, (node) => setMediaElement(node))}
			playsInline
			preload="metadata"
			className={cn("h-full w-full max-h-[72vh] object-contain", className)}
			onLoadedMetadata={(event) => {
				setMediaKind("video");
				props.onLoadedMetadata?.(event);
			}}
			{...props}
		/>
	);
});

const MediaPlayerAudio = React.forwardRef<
	HTMLAudioElement,
	React.AudioHTMLAttributes<HTMLAudioElement>
>(function MediaPlayerAudio({ className, ...props }, ref) {
	const { setMediaElement, setMediaKind } = useMediaPlayer();
	return (
		<audio
			ref={mergeRefs(ref, (node) => setMediaElement(node))}
			preload="metadata"
			className={cn("w-full", className)}
			onLoadedMetadata={(event) => {
				setMediaKind("audio");
				props.onLoadedMetadata?.(event);
			}}
			{...props}
		/>
	);
});

function MediaPlayerLoading({ className }: React.HTMLAttributes<HTMLDivElement>) {
	const { loading } = useMediaPlayer();
	if (!loading) return null;
	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35",
				className,
			)}
		>
			<Loader2 className="h-6 w-6 animate-spin text-white" />
		</div>
	);
}

function MediaPlayerError({ className }: React.HTMLAttributes<HTMLDivElement>) {
	const { error } = useMediaPlayer();
	if (!error) return null;
	return (
		<div
			className={cn(
				"absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center text-sm text-white",
				className,
			)}
		>
			{error}
		</div>
	);
}

function MediaPlayerVolumeIndicator({
	className,
}: React.HTMLAttributes<HTMLDivElement>) {
	const { muted, volume, volumeIndicatorVisible } = useMediaPlayer();
	if (!volumeIndicatorVisible) return null;
	const percent = muted ? 0 : Math.round(volume * 100);
	return (
		<div
			className={cn(
				"pointer-events-none absolute right-3 top-3 rounded-md bg-black/65 px-2 py-1 text-xs text-white",
				className,
			)}
		>
			{percent === 0 ? "Muted" : `${percent}%`}
		</div>
	);
}

function MediaPlayerControls({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-3 text-white",
				className,
			)}
			{...props}
		/>
	);
}

function MediaPlayerControlsOverlay({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent",
				className,
			)}
			{...props}
		/>
	);
}

function MediaPlayerPlay({
	className,
	onClick,
	...props
}: React.ComponentProps<typeof Button>) {
	const { playing, togglePlay } = useMediaPlayer();
	return (
		<Button
			{...props}
			type="button"
			size="icon"
			variant="ghost"
			className={cn(controlButtonClass, className)}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) return;
				togglePlay();
			}}
		>
			{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
		</Button>
	);
}

function MediaPlayerSeekBackward({
	className,
	onClick,
	...props
}: React.ComponentProps<typeof Button>) {
	const { seekBy } = useMediaPlayer();
	return (
		<Button
			{...props}
			type="button"
			size="icon"
			variant="ghost"
			className={cn(controlButtonClass, className)}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) return;
				seekBy(-10);
			}}
		>
			<SkipBack className="h-4 w-4" />
		</Button>
	);
}

function MediaPlayerSeekForward({
	className,
	onClick,
	...props
}: React.ComponentProps<typeof Button>) {
	const { seekBy } = useMediaPlayer();
	return (
		<Button
			{...props}
			type="button"
			size="icon"
			variant="ghost"
			className={cn(controlButtonClass, className)}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) return;
				seekBy(10);
			}}
		>
			<SkipForward className="h-4 w-4" />
		</Button>
	);
}

function MediaPlayerVolume({ className }: { className?: string }) {
	const { muted, volume, setVolume, toggleMute } = useMediaPlayer();
	const displayVolume = muted ? 0 : volume;
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				className={controlButtonClass}
				onClick={toggleMute}
			>
				{displayVolume === 0 ? (
					<VolumeX className="h-4 w-4" />
				) : (
					<Volume2 className="h-4 w-4" />
				)}
			</Button>
			<Slider
				min={0}
				max={100}
				step={1}
				value={[Math.round(displayVolume * 100)]}
				onValueChange={(value) => {
					const next = Array.isArray(value) ? value[0] ?? 0 : 0;
					setVolume(next / 100);
				}}
				className="w-20 [&_[data-slot='slider-track']]:bg-white/20 [&_[data-slot='slider-range']]:bg-white [&_[data-slot='slider-thumb']]:border-white/80 [&_[data-slot='slider-thumb']]:bg-white"
			/>
		</div>
	);
}

function MediaPlayerSeek({ className }: { className?: string }) {
	const { currentTime, duration, seekTo } = useMediaPlayer();
	const safeDuration = Number.isFinite(duration) ? duration : 0;
	return (
		<Slider
			min={0}
			max={safeDuration || 1}
			step={0.1}
			value={[currentTime]}
			disabled={safeDuration <= 0}
			onValueChange={(value) => {
				const next = Array.isArray(value) ? value[0] ?? 0 : 0;
				seekTo(next);
			}}
			className={cn(
				"w-full [&_[data-slot='slider-track']]:bg-white/20 [&_[data-slot='slider-range']]:bg-white [&_[data-slot='slider-thumb']]:border-white/90 [&_[data-slot='slider-thumb']]:bg-white",
				className,
			)}
		/>
	);
}

function MediaPlayerTime({ className }: { className?: string }) {
	const { currentTime, duration } = useMediaPlayer();
	return (
		<span className={cn("text-xs tabular-nums text-white/90", className)}>
			{formatTime(currentTime)} / {formatTime(duration)}
		</span>
	);
}

function MediaPlayerPlaybackSpeed({ className }: { className?: string }) {
	const { playbackRate, setPlaybackRate } = useMediaPlayer();
	return (
		<label className={cn("flex items-center gap-2 text-xs text-white/90", className)}>
			<span className="sr-only">Playback speed</span>
			<select
				value={String(playbackRate)}
				onChange={(event) => setPlaybackRate(Number(event.target.value))}
				className="h-8 rounded-md border border-white/25 bg-black/55 px-2 text-xs text-white outline-none"
			>
				{[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
					<option key={speed} value={speed}>
						{speed}x
					</option>
				))}
			</select>
		</label>
	);
}

function MediaPlayerLoop({
	className,
	onClick,
	...props
}: React.ComponentProps<typeof Button>) {
	const { loop, toggleLoop } = useMediaPlayer();
	return (
		<Button
			{...props}
			type="button"
			size="icon"
			variant="ghost"
			className={cn(controlButtonClass, loop && "bg-white/15", className)}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) return;
				toggleLoop();
			}}
		>
			<Repeat className="h-4 w-4" />
		</Button>
	);
}

function MediaPlayerCaptions({
	className,
	onClick,
	...props
}: React.ComponentProps<typeof Button>) {
	const { mediaKind, captionsEnabled, toggleCaptions } = useMediaPlayer();
	if (mediaKind !== "video") return null;
	return (
		<Button
			{...props}
			type="button"
			size="icon"
			variant="ghost"
			className={cn(
				controlButtonClass,
				captionsEnabled && "bg-white/15",
				className,
			)}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) return;
				toggleCaptions();
			}}
		>
			<Captions className="h-4 w-4" />
		</Button>
	);
}

function MediaPlayerFullscreen({
	className,
	onClick,
	...props
}: React.ComponentProps<typeof Button>) {
	const { isFullscreen, toggleFullscreen } = useMediaPlayer();
	return (
		<Button
			{...props}
			type="button"
			size="icon"
			variant="ghost"
			className={cn(controlButtonClass, className)}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) return;
				toggleFullscreen();
			}}
		>
			{isFullscreen ? (
				<Minimize className="h-4 w-4" />
			) : (
				<Maximize className="h-4 w-4" />
			)}
		</Button>
	);
}

function MediaPlayerPiP({
	className,
	onClick,
	...props
}: React.ComponentProps<typeof Button>) {
	const { mediaKind, isPiP, togglePiP } = useMediaPlayer();
	if (mediaKind !== "video") return null;
	return (
		<Button
			{...props}
			type="button"
			size="icon"
			variant="ghost"
			className={cn(controlButtonClass, isPiP && "bg-white/15", className)}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented) return;
				togglePiP();
			}}
		>
			<PictureInPicture className="h-4 w-4" />
		</Button>
	);
}

function MediaPlayerDownload({
	className,
	...props
}: React.ComponentProps<typeof Button>) {
	const { mediaElement } = useMediaPlayer();
	const href = mediaElement?.currentSrc ?? "";
	return (
		<Button
			{...props}
			type="button"
			size="icon"
			variant="ghost"
			className={cn(controlButtonClass, className)}
			asChild
		>
			<a href={href || undefined} download target="_blank" rel="noreferrer">
				<Download className="h-4 w-4" />
			</a>
		</Button>
	);
}

type MediaPlayerSettingsProps = {
	speeds?: number[];
	className?: string;
};

function MediaPlayerSettings({
	speeds = [0.5, 0.75, 1, 1.25, 1.5, 2],
	className,
}: MediaPlayerSettingsProps) {
	const { playbackRate, setPlaybackRate, loop, toggleLoop, mediaKind, togglePiP } =
		useMediaPlayer();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className={cn(controlButtonClass, className)}
				>
					<Settings2 className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-44 border-white/20 bg-black/90 text-white"
			>
				<div className="px-2 py-1.5 text-xs font-medium text-white/70">
					Playback speed
				</div>
				<DropdownMenuRadioGroup
					value={String(playbackRate)}
					onValueChange={(value) => setPlaybackRate(Number(value))}
				>
					{speeds.map((speed) => (
						<DropdownMenuRadioItem key={speed} value={String(speed)}>
							{speed}x
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator className="bg-white/20" />
				<DropdownMenuItem onSelect={toggleLoop}>
					<Repeat className="h-4 w-4" />
					{loop ? "Disable loop" : "Enable loop"}
				</DropdownMenuItem>
				{mediaKind === "video" ? (
					<DropdownMenuItem onSelect={togglePiP}>
						<MonitorUp className="h-4 w-4" />
						Picture in Picture
					</DropdownMenuItem>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

type MediaPlayerExports = React.ForwardRefExoticComponent<
	MediaPlayerRootProps & React.RefAttributes<HTMLDivElement>
> & {
	Root: typeof MediaPlayerRoot;
	Video: typeof MediaPlayerVideo;
	Audio: typeof MediaPlayerAudio;
	Loading: typeof MediaPlayerLoading;
	Error: typeof MediaPlayerError;
	VolumeIndicator: typeof MediaPlayerVolumeIndicator;
	Controls: typeof MediaPlayerControls;
	ControlsOverlay: typeof MediaPlayerControlsOverlay;
	Play: typeof MediaPlayerPlay;
	SeekBackward: typeof MediaPlayerSeekBackward;
	SeekForward: typeof MediaPlayerSeekForward;
	Volume: typeof MediaPlayerVolume;
	Seek: typeof MediaPlayerSeek;
	Time: typeof MediaPlayerTime;
	PlaybackSpeed: typeof MediaPlayerPlaybackSpeed;
	Loop: typeof MediaPlayerLoop;
	Captions: typeof MediaPlayerCaptions;
	Fullscreen: typeof MediaPlayerFullscreen;
	PiP: typeof MediaPlayerPiP;
	Download: typeof MediaPlayerDownload;
	Settings: typeof MediaPlayerSettings;
};

const MediaPlayer = Object.assign(MediaPlayerRoot, {
	Root: MediaPlayerRoot,
	Video: MediaPlayerVideo,
	Audio: MediaPlayerAudio,
	Loading: MediaPlayerLoading,
	Error: MediaPlayerError,
	VolumeIndicator: MediaPlayerVolumeIndicator,
	Controls: MediaPlayerControls,
	ControlsOverlay: MediaPlayerControlsOverlay,
	Play: MediaPlayerPlay,
	SeekBackward: MediaPlayerSeekBackward,
	SeekForward: MediaPlayerSeekForward,
	Volume: MediaPlayerVolume,
	Seek: MediaPlayerSeek,
	Time: MediaPlayerTime,
	PlaybackSpeed: MediaPlayerPlaybackSpeed,
	Loop: MediaPlayerLoop,
	Captions: MediaPlayerCaptions,
	Fullscreen: MediaPlayerFullscreen,
	PiP: MediaPlayerPiP,
	Download: MediaPlayerDownload,
	Settings: MediaPlayerSettings,
}) as MediaPlayerExports;

export {
	MediaPlayer,
	MediaPlayerAudio,
	MediaPlayerCaptions,
	MediaPlayerControls,
	MediaPlayerControlsOverlay,
	MediaPlayerDownload,
	MediaPlayerError,
	MediaPlayerFullscreen,
	MediaPlayerLoading,
	MediaPlayerLoop,
	MediaPlayerPiP,
	MediaPlayerPlaybackSpeed,
	MediaPlayerPlay,
	MediaPlayerSeek,
	MediaPlayerSeekBackward,
	MediaPlayerSeekForward,
	MediaPlayerSettings,
	MediaPlayerTime,
	MediaPlayerVideo,
	MediaPlayerVolume,
	MediaPlayerVolumeIndicator,
};
