import * as Clipboard from "expo-clipboard";
import { ClipboardPaste, MoreHorizontal, ShieldOff, TextQuote, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from "react";
import { Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { AndroidWebViewProps, IOSWebViewProps } from "react-native-webview/lib/WebViewTypes";
import { Button, confirm, EmptyState, ErrorState, Header, HorizontalScroll, Icon, IconButton, Screen, Sheet, showActions, SkeletonRows, Text, toast, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { setChatDraft } from "../chatDraft";
import type { DesktopClient } from "../client";
import { Code } from "../Code";
import { ConnectionNotice } from "../CodeThreadList";
import { clientFor } from "../connections";
import { useDesktop } from "../store";
import { useTerminal, type TerminalSink } from "./hooks";
import { terminalPage } from "./terminalPage.generated";
import { appendBlock, keyBar, pasteData, selectedLines, terminalContext, terminalStatus, withModifier, type Modifier } from "./terminalState";

/**
 * A terminal on the computer, from a thread: xterm in a WebView (bundled, nothing loaded from the network) at the
 * phone's own width, a key bar with Esc, Tab, Ctrl, Alt, arrows and Paste, and Attach output, which puts lines into the
 * thread's message. Typing goes to the computer as it's typed; offline, nothing is kept to send later.
 */
export function TerminalScreen({ desktopId, chatId, terminalId, title }: { desktopId: string; chatId: string; terminalId: string; title: string | null }) {
  const desktop = useDesktop(desktopId);
  const client = desktop ? clientFor(desktop) : null;
  if (desktop === undefined) return <Screen><Header back title={title ?? "Terminal"} /><SkeletonRows count={5} /></Screen>;
  if (!client) return <Screen><Header back title={title ?? "Terminal"} /><EmptyState className="flex-1" title="This computer isn't paired" body="Pair it again from Account → Desktops." /></Screen>;
  return <TerminalView client={client} desktopId={desktopId} chatId={chatId} terminalId={terminalId} title={title} />;
}

/** What the page is driven by: injected calls to window.phaseoTerminal. */
type PageHandle = { injectJavaScript(code: string): void };
// react-native-webview types its component with the iOS, Android and Windows props intersected, which TypeScript
// reduces to no props at all; these are the ones used here.
type PageProps = AndroidWebViewProps & Pick<IOSWebViewProps, "hideKeyboardAccessoryView" | "keyboardDisplayRequiresUserAction"> & { ref?: Ref<PageHandle> };
const Page = WebView as unknown as ComponentType<PageProps>;

type PageMessage = { type: "ready" } | { type: "lines"; lines: string[] };

function TerminalView({ client, desktopId, chatId, terminalId, title }: { client: DesktopClient; desktopId: string; chatId: string; terminalId: string; title: string | null }) {
  const insets = useSafeAreaInsets();
  const page = useRef<PageHandle>(null);
  // Output waits here until the page has loaded xterm.
  const ready = useRef(false);
  const queued = useRef<string[]>([]);
  const run = useCallback((code: string) => page.current?.injectJavaScript(`${code};true;`), []);
  const sink = useMemo<TerminalSink>(() => ({
    write: (data) => { if (!data) return; if (ready.current) run(`window.phaseoTerminal.write(${JSON.stringify(data)})`); else queued.current.push(data); },
    reset: () => { queued.current = []; if (ready.current) run("window.phaseoTerminal.reset()"); },
  }), [run]);
  const { allowed, terminal, error, retry, send } = useTerminal(client, terminalId, sink);
  const running = terminal?.status === "running";
  const name = terminal?.title ?? title ?? "Terminal";

  // Ctrl or Alt applies to the next key, from the key bar or the keyboard; the ref is what a key reads, the state what shows.
  const [modifier, setModifierShown] = useState<Modifier | null>(null);
  const held = useRef<Modifier | null>(null);
  const setModifier = useCallback((value: Modifier | null) => { held.current = value; setModifierShown(value); }, []);
  const type = useCallback((data: string) => {
    const pressed = held.current;
    if (pressed) { setModifier(null); send(withModifier(data, pressed)); } else send(data);
  }, [send, setModifier]);

  // Typing goes through a native field, not xterm's own: Android keyboards compose into a web text box and drop or
  // repeat letters there. Enter sends the line and Enter; with Ctrl or Alt held, the next letter goes at once.
  const [line, setLine] = useState("");
  const placeholder = useToneColor("muted");
  const changeLine = useCallback((value: string) => {
    if (held.current && value.length === line.length + 1 && value.startsWith(line)) { type(value.slice(-1)); return; }
    setLine(value);
  }, [line, type]);
  const submitLine = useCallback(() => { type(`${line}\r`); setLine(""); }, [line, type]);

  const [lines, setLines] = useState<string[] | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  // Each opening starts with a fresh choice of lines.
  const [attachKey, setAttachKey] = useState(0);

  const background = String(useCSSVariable("--color-background") ?? "#0a0a0a");
  const foreground = String(useCSSVariable("--color-foreground") ?? "#fafafa");
  const muted = String(useCSSVariable("--color-muted") ?? "#27272a");
  const theme = JSON.stringify({ background, foreground, cursor: foreground, cursorAccent: background, selectionBackground: muted });
  useEffect(() => { if (ready.current) run(`window.phaseoTerminal.theme(${theme})`); }, [run, theme]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let message: PageMessage;
    try { message = JSON.parse(event.nativeEvent.data) as PageMessage; } catch { return; }
    if (message.type === "ready") {
      ready.current = true;
      run(`window.phaseoTerminal.theme(${theme})`);
      const waiting = queued.current.join(""); queued.current = [];
      if (waiting) run(`window.phaseoTerminal.write(${JSON.stringify(waiting)})`);
    } else if (message.type === "lines") setLines(message.lines);
  }, [run, theme]);

  const paste = async () => {
    const text = await Clipboard.getStringAsync().catch(() => "");
    if (!text) { toast("The clipboard is empty."); return; }
    haptic("press");
    send(pasteData(text));
  };
  const openAttach = () => { setLines(null); setAttachKey((key) => key + 1); setAttachOpen(true); run("window.phaseoTerminal.lines(200)"); };
  const attach = (text: string) => {
    setChatDraft(desktopId, chatId, (draft) => appendBlock(draft, terminalContext(name, text)));
    setAttachOpen(false);
    haptic("success");
    toast("Added to the thread's message.");
  };
  const close = async () => {
    if (!(await confirm({ title: `Close ${name}?`, body: "Its process stops on the computer, as closing it in the window does.", confirmLabel: "Close terminal", destructive: true }))) return;
    try { await client.request("close_terminal", { terminalId }); haptic("success"); } catch (problem) { toast(problem instanceof Error ? problem.message : "Couldn't close it.", { tone: "error" }); }
  };

  const subtitle = terminal ? terminalStatus(terminal) : null;
  const header = (
    <Header back title={name} subtitle={subtitle}
      right={allowed && terminal ? (
        <View className="flex-row">
          <IconButton icon={TextQuote} label="Attach output" onPress={openAttach} />
          {running ? <IconButton icon={MoreHorizontal} label="More" onPress={() => showActions({ title: name, actions: [{ key: "close", label: "Close terminal", icon: X, destructive: true, onPress: () => void close() }] })} /> : null}
        </View>
      ) : null}
    />
  );
  if (!allowed || error?.code === "forbidden") {
    return <Screen>{header}<ConnectionNotice client={client} /><EmptyState className="flex-1" icon={ShieldOff} title="Terminals are off for this phone" body="Turn on Use terminals for this phone on the computer, in Settings → Phone." /></Screen>;
  }
  return (
    <Screen>
      {header}
      <ConnectionNotice client={client} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {error && !terminal ? <ErrorState className="flex-1" error={new Error(error.message)} onRetry={retry} /> : (
          <View className="flex-1" style={{ backgroundColor: background }}>
            <Page
              ref={page}
              source={{ html: terminalPage }}
              // The page is the bundled one; it never navigates anywhere, so a link printed in a terminal can't open in it.
              originWhitelist={["about:blank", "data:*"]}
              onShouldStartLoadWithRequest={(request) => request.url === "about:blank" || request.url.startsWith("data:")}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled={false}
              setSupportMultipleWindows={false}
              textZoom={100}
              overScrollMode="never"
              keyboardDisplayRequiresUserAction={false}
              hideKeyboardAccessoryView
              style={{ flex: 1, backgroundColor: background }}
              accessibilityLabel={`${name} output`}
            />
          </View>
        )}
        <View className="border-t border-border bg-background" style={{ paddingBottom: Math.max(insets.bottom, 4) }}>
          {running ? (
            <View className="flex-row items-center gap-2 px-2 pt-1.5">
              <TextInput
                value={line}
                onChangeText={changeLine}
                onSubmitEditing={submitLine}
                submitBehavior="submit"
                placeholder={modifier ? `${modifier === "ctrl" ? "Ctrl" : "Alt"} + a key` : "Type, then Enter"}
                placeholderTextColor={placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                keyboardType={Platform.OS === "android" ? "visible-password" : "ascii-capable"}
                returnKeyType="send"
                accessibilityLabel={`Type in ${name}`}
                className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-[13px] text-foreground"
                style={{ fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) }}
              />
            </View>
          ) : null}
          {running ? (
            <HorizontalScroll keyboardShouldPersistTaps="always" contentContainerClassName="gap-1.5 px-2 py-1.5">
              {keyBar.map((key) => {
                const held = "modifier" in key && modifier === key.modifier;
                return (
                  <Pressable key={key.key} accessibilityRole="button" accessibilityLabel={key.label} accessibilityState={"modifier" in key ? { selected: held } : undefined}
                    onPress={() => { haptic("selection"); if ("modifier" in key) setModifier(held ? null : key.modifier); else type(key.data); }}
                    className={cn("h-9 min-w-11 items-center justify-center rounded-md border border-border px-2.5 active:bg-accent", held && "border-primary bg-primary")}>
                    <Text variant="small" className={cn(held && "text-primary-foreground")}>{key.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable accessibilityRole="button" accessibilityLabel="Paste" onPress={() => void paste()} className="h-9 flex-row items-center justify-center gap-1.5 rounded-md border border-border px-2.5 active:bg-accent">
                <Icon icon={ClipboardPaste} size={15} />
                <Text variant="small">Paste</Text>
              </Pressable>
            </HorizontalScroll>
          ) : terminal ? (
            <Text variant="caption" className="px-4 py-3">{`${terminalStatus(terminal)}. Open a new terminal from the thread to keep working.`}</Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      <AttachSheet key={attachKey} open={attachOpen} lines={lines} onClose={() => setAttachOpen(false)} onAttach={attach} />
    </Screen>
  );
}

/** The terminal's latest lines: tap the first and last you want, then add them to the thread's message. */
function AttachSheet({ open, lines, onClose, onAttach }: { open: boolean; lines: string[] | null; onClose(): void; onAttach(text: string): void }) {
  const list = useRef<ScrollViewInstance>(null);
  // Until a line is tapped, the last line is chosen.
  const [picked, setPicked] = useState<{ from: number; to: number } | null>(null);
  const range = picked ?? (lines?.length ? { from: lines.length - 1, to: lines.length - 1 } : null);
  const pick = (index: number) => {
    haptic("selection");
    // The first tap starts a new range; the second ends it.
    setPicked((current) => (!current || current.from !== current.to ? { from: index, to: index } : { from: current.from, to: index }));
  };
  const inside = (index: number) => Boolean(range) && index >= Math.min(range!.from, range!.to) && index <= Math.max(range!.from, range!.to);
  const count = range ? Math.abs(range.to - range.from) + 1 : 0;
  return (
    <Sheet open={open} onClose={onClose} size="tall">
      <View className="gap-1 px-4 pb-2 pt-4">
        <Text variant="heading">Attach output</Text>
        <Text variant="caption">{`Tap the first line and the last line to add to the thread's message.${count ? ` ${count === 1 ? "1 line" : `${count} lines`} chosen.` : ""}`}</Text>
      </View>
      {!lines ? <SkeletonRows count={6} /> : !lines.length ? <Text variant="caption" className="px-4 py-3">Nothing written yet.</Text> : (
        // Opens at the latest lines, which are the ones usually wanted.
        <ScrollView ref={list} className="max-h-[440px]" onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}>
          {lines.map((line, index) => (
            <Pressable key={index} accessibilityRole="button" accessibilityState={{ selected: inside(index) }} onPress={() => pick(index)} className={cn("min-h-7 justify-center px-4 py-0.5 active:bg-accent", inside(index) && "bg-accent")}>
              <Code className="text-foreground" numberOfLines={3}>{line || " "}</Code>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View className="flex-row gap-2 border-t border-border px-4 py-3">
        <Button className="flex-1" label="Cancel" variant="secondary" onPress={onClose} />
        <Button className="flex-1" label="Add to message" disabled={!lines?.length || !range} onPress={() => range && lines && onAttach(selectedLines(lines, range.from, range.to))} />
      </View>
    </Sheet>
  );
}
