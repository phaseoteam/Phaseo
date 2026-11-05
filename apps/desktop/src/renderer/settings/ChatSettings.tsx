import { usePersistedState } from "../lib/persistedState";
import { isMac } from "../lib/shortcuts";
import { setSendKey, useSendKey } from "../chat/sendKey";
import { shortcut } from "../lib/keybindings";
import { Select } from "../components/Select";
import { Switch } from "../components/ui/switch";
import { quitConfirmations, type ChatPreferences } from "../../shared/chatPreferences";
import { usePreferences } from "./GeneralSettings";
import { SettingsNote, SettingsPageLayout, SettingsRow, SettingsSection } from "./SettingsLayout";

/** Search words for Settings → Chat. */
export const chatSettingsKeywords = "chat message box composer send enter shortcut new line follow-up follow up queue steer running turn rich text markdown format hold quit ctrl+q cmd+qting bold italic plain text quit quitting confirm close window exit ask before quitting working chats";

/** Saves one change to the chat group, keeping the rest. */
function useChatPreferences() {
	const { preferences, save, ready, busy, error } = usePreferences();
	const chat = preferences.chat;
	const change = (value: Partial<ChatPreferences>) => void save({ ...preferences, chat: { ...chat, ...value } });
	return { chat, change, disabled: !ready || busy, error, preferences, save };
}

export function ChatSettings() {
	const { chat, change, disabled, error } = useChatPreferences();
	const sendKey = useSendKey(), mod = isMac() ? "⌘" : "Ctrl";
	const sendAndNew = shortcut("composer.sendAndNewChat"), steer = shortcut("composer.steer");
	const other = sendKey === "enter" ? `${mod}+Enter` : "Enter";
	return <SettingsPageLayout title="Chat">
		<SettingsSection title="Message box" label="Message box">
			<SettingsRow title="Send with" description={`${sendKey === "enter" ? "Shift+Enter adds a new line." : "Enter adds a new line."}${sendAndNew ? ` ${sendAndNew} sends and starts a new chat.` : ""}`}
				control={<Select label="Send with" value={sendKey} onValueChange={value => setSendKey(value === "mod+enter" ? "mod+enter" : "enter")}
					options={[{ value: "enter", label: "Enter" }, { value: "mod+enter", label: `${mod}+Enter` }]} />} />
			<SettingsRow title="Follow-ups while an agent works" description={chat.followUp === "steer"
				? `Sending puts your message into the running turn, so the agent sees it straight away.${sendKey === "enter" ? ` ${other} queues it for after the turn instead.` : ""}`
				: `Sending queues your message for after the turn.${sendKey === "enter" ? ` ${other} puts it into the running turn instead.` : steer ? ` ${steer} puts it into the running turn instead.` : ""}`}
				control={<Select label="Follow-ups while an agent works" disabled={disabled} value={chat.followUp} onValueChange={value => change({ followUp: value === "steer" ? "steer" : "queue" })}
					options={[{ value: "queue", label: "Queue (default)" }, { value: "steer", label: "Steer" }]} />} />
			<SettingsRow title="Rich text" description="Show Markdown formatting, such as bold, headings and code, as you type: in message boxes, comments, issues, instructions and other places you write Markdown. Off keeps the text plain; the characters you type are the same either way."
				control={<Switch aria-label="Rich text in the message box" disabled={disabled} checked={chat.richTextComposer} onCheckedChange={richTextComposer => change({ richTextComposer })} />} />
		</SettingsSection>
		<SettingsSection title="Quitting" label="Quitting">
			<SettingsRow title="Protect against quitting" description={`Quitting stops chats that are still working; they continue the next time Phaseo opens (Settings → Maintenance). Holding means ${isMac() ? "⌘Q" : "Ctrl+Q"} quits only once held for a second, and other ways of quitting${isMac() ? "" : ", such as closing the last window,"} ask while chats are working.`}
				control={<Select label="Protect against quitting" disabled={disabled} value={chat.quitConfirmation} onValueChange={value => { const choice = quitConfirmations.find(option => option === value); if (choice) change({ quitConfirmation: choice }); }}
					options={[{ value: "hold", label: `Hold ${isMac() ? "⌘Q" : "Ctrl+Q"} to quit (default)` }, { value: "working", label: "Ask while chats are working" }, { value: "always", label: "Always ask" }, { value: "direct", label: "Quit straight away" }]} />} />
			{!isMac() && <SettingsRow title="Keep running in the tray" description="Closing the window hides Phaseo to the tray, so chats, scheduled tasks and the operator keep working. Quit from the tray icon's menu."
				control={<Switch aria-label="Keep running in the tray" disabled={disabled} checked={chat.keepInTray} onCheckedChange={keepInTray => change({ keepInTray })} />} />}
			<SettingsRow title="Open at login" description="Start Phaseo when you sign in to this computer. Installed versions only."
				control={<Switch aria-label="Open at login" disabled={disabled} checked={chat.openAtLogin} onCheckedChange={openAtLogin => change({ openAtLogin })} />} />
		</SettingsSection>
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
	</SettingsPageLayout>;
}

/** Search words for Settings → Diffs. */
export const diffSettingsKeywords = "diffs diff layout unified split side by side whitespace ignore hide colours colors colour blind color blind red green blue orange accessibility files expanded collapsed default file state open panes automatically pull requests open in phaseo github";

export function DiffSettings() {
	const { chat, change, disabled, error, preferences, save } = useChatPreferences();
	const [autoOpenPanes, setAutoOpenPanes] = usePersistedState("phaseo.desktop.panes.autoOpen", true);
	return <SettingsPageLayout title="Diffs">
		<SettingsSection title="Showing changes" label="Showing changes">
			<SettingsRow title="Layout" description="How diffs open in the changes panel and a pull request's Code tab. The layout buttons there change this too."
				control={<Select label="Diff layout" disabled={disabled} value={chat.diffLayout} onValueChange={value => change({ diffLayout: value === "split" ? "split" : "unified" })}
					options={[{ value: "unified", label: "Unified (default)" }, { value: "split", label: "Split" }]} />} />
			<SettingsRow title="Hide whitespace changes" description="Leave out lines that only change spaces, tabs or line endings. The whitespace button in each diff changes this too."
				control={<Switch aria-label="Hide whitespace changes" disabled={disabled} checked={chat.diffIgnoreWhitespace} onCheckedChange={diffIgnoreWhitespace => change({ diffIgnoreWhitespace })} />} />
			<SettingsRow title="Colours" description="Added and removed lines in red and green, or in blue and orange, which are easier to tell apart if you confuse red and green."
				control={<Select label="Diff colours" disabled={disabled} value={chat.diffColours} onValueChange={value => change({ diffColours: value === "blue-orange" ? "blue-orange" : "red-green" })}
					options={[{ value: "red-green", label: "Red and green (default)" }, { value: "blue-orange", label: "Blue and orange" }]} />} />
			<SettingsRow title="Default file state" description="Start with files expanded or collapsed when opening diffs or a pull request's Code tab."
				control={<Select label="Default diff file state" disabled={disabled} value={preferences.diffFilesCollapsed ? "collapsed" : "expanded"} onValueChange={value => void save({ ...preferences, diffFilesCollapsed: value === "collapsed" })}
					options={[{ value: "expanded", label: "Expanded" }, { value: "collapsed", label: "Collapsed" }]} />} />
		</SettingsSection>
		<SettingsSection title="Panes" label="Panes">
			<SettingsRow title="Open panes automatically" description="Show the diff when a turn changes files, and a pull request when one is linked to the chat. Using the pane during a turn holds this back."
				control={<Switch aria-label="Open panes automatically" checked={autoOpenPanes} onCheckedChange={setAutoOpenPanes} />} />
			<SettingsRow title="Open pull requests in Phaseo" description={`Clicking a pull request link opens it in Phaseo. ${isMac() ? "⌘-click" : "Ctrl-click"} or middle-click still opens it on GitHub. Turn off to open pull request links like any other link, on GitHub.`}
				control={<Switch aria-label="Open pull requests in Phaseo" disabled={disabled} checked={preferences.openPullRequestsInApp} onCheckedChange={value => void save({ ...preferences, openPullRequestsInApp: value })} />} />
		</SettingsSection>
		{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
	</SettingsPageLayout>;
}
