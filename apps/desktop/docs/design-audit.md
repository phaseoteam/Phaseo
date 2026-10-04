# Desktop design review

Reviewed against the live Phaseo Models and Chat layouts and the web application's existing fonts, logo, palette, buttons and inputs. Updated 4 October 2026. Screenshots use a separate local profile with sample conversations and native configuration fixtures, with no connected accounts or inference calls.

## Flow and findings

1. **Home:** replace tiny metric labels and a setup panel stretched across two empty sections with readable metrics, compact setup/running sections and a full-width recent-work list.
2. **New task:** retain account, harness, mode and model choice; use matching input sizes, clear labels and consistent form gaps. Group Create and Import in a wrapping action row with an 8-pixel gap; the rendered audit checks this in both themes and window sizes.
3. **Conversation:** keep the title and compact actions on one row at minimum width; retain named controls for assistive technology and tooltips for handoff/settings. Keep message and composer backgrounds distinct. The long conversation remains scrollable.
4. **Accounts:** place connected profiles and account creation in separate padded sections, with the same heading, 24-pixel inset and form rhythm as Agents and Settings. Profile actions wrap instead of overflowing narrower sections. Preserve row dividers between profiles.
5. **Projects:** use matching controls, wrap project/Git actions and show selected Files/Git tabs. This visual capture covers the empty state; the separate desktop smoke covers real file/Git interactions.
6. **Missions:** move the heading above a padded form, make instructions span both columns, separate recurring work and retain readable weekday checkboxes.
7. **Agents:** replace browser-default controls and an inline unpadded form with matching controls, padded rows and a two-column form.
8. **MCP:** apply the same form and row treatment; keep checkbox controls at their own size.
9. **Settings:** use aligned preference rows with separate labels and helper text; indicate the current page in navigation.
10. **Inbox:** use the same headings, list padding and readable empty-state text.
11. **Platform:** replace the decorative marketing hero and unverified readiness/health badges with concise links to the existing web tools.
12. **Conversation settings:** inset the model, reasoning and mode controls by 24 pixels, matching the toolbar and composer. Capture both window sizes and themes after the rendered frame settles.
13. **Conversation typography:** prevent the general message rule from preserving Markdown whitespace between rendered blocks. Use explicit heading, paragraph and list spacing; retain preformatted code. The audit verifies normal Markdown whitespace and a heading-to-paragraph gap no greater than 20 pixels (currently 12 pixels).
14. **Settings actions:** group Save and Cancel beneath the fields rather than spreading them across separate grid cells. Use the website's primary-button treatment for Save and allow the action row to wrap.
15. **Account editing:** use the same 24-pixel padded form as account creation, with grouped actions and a named form. Capture the complete editor after scrolling it into view and verify the key field remains empty.
16. **Code blocks:** add a compact copy toolbar with success/failure feedback. The rendered audit uses an owned clipboard fixture to verify indentation, Unicode and trailing-newline preservation without writing to the user's clipboard.
17. **Agent and MCP forms:** place submit/cancel controls together below the fields. Keep long agent commands in an expandable, wrapped code surface; native disclosure preserves keyboard operation and the complete command. Give connection-result text its own padded section. Additional captures cover expanded commands and agent editing in both themes/window sizes.
18. **Syntax highlighting:** use the website's Shiki GitHub light/dark colours, loading bundled grammars on demand. Code renders as React text tokens and retains exact copy formatting. Unknown languages and oversized blocks remain plain text. The JavaScript engine works within the existing renderer security policy. The audit waits for visible token colours before checking copy success/failure.
19. **Task history:** use database-backed 50-row pages, matching controls for Load more/Retry, loading feedback and specific empty states. A separate 155-task Electron workflow checks paging, later-page selection, searches and archive switching. Stable Markdown renderer functions preserve code highlighting and copy feedback during history refreshes.
20. **Attention summaries:** Home and Inbox use metadata without conversation/request bodies. Home labels the count Needs attention and includes failures, interrupted work, limits and unresolved requests. Rendered history checks verify a failed task appears on both screens and opens its full conversation. Command search uses the same metadata snapshot.
21. **Conversation history:** read only 50 recent messages/activities in selected-task IPC, load older/newer bodies from SQLite pages and retain at most 100 messages and 100 activities in the view. Keep visible-entry anchors through loading, errors and page changes. The source/packaged workflow traverses a 1,000-message fixture in both directions, verifies failure/retry and duplicate suppression, and retains a newer edit delivered during a delayed page request. Reopening resets recent history; existing live-following and delayed-layout checks remain covered. Byte limits and large-history performance profiling remain separate checks.
22. **Live conversation navigation:** open at the latest entry and follow new content while the reader stays near the bottom. Scrolling back pauses following and reveals Jump to latest. Returning to the bottom resumes following. Observe delayed content resizing so highlighting, fonts and expanded results preserve this behavior. Source and packaged fixtures verify following, pausing, returning, delayed resizing and the older-history reading anchor.

23. **Panel list alignment:** recent and running task rows use the same 24-pixel horizontal inset as their headings, square internal edges and one separator per row. Secondary metadata uses regular weight. This removes inherited button outlines from the list; refreshed Home captures cover both themes and window sizes.

24. **Form layout:** remove duplicate separators beneath panel headings, keep Add account actions on a dedicated full-width row, and allow two-column fields to shrink within their grid. Align project form actions with their inputs. Rendered assertions verify account field containment and action placement at both window sizes; packaged captures now include the complete Add account form.

25. **Queued conversation layout:** keep queued instructions in their own bounded scrolling region, show their count, and wrap row actions with the editor on a full-width row. The composer does not shrink and its actions wrap. A 12-message rendered fixture verifies access to the final entry, editor containment and visible conversation/composer space at both window sizes in both themes.

26. **Activity results:** use readable disclosure labels and padded, bounded output with Copy result feedback. Tool, reasoning, plan and usage outputs remain inert text. Code and activity copying share exact-source handling; delayed clipboard completion cannot confirm text that changed in the meantime. The rendered audit verifies Unicode/newline preservation, failure feedback, inert markup, scrolling and stale-completion rejection through an owned clipboard fixture in both themes/window sizes.

27. **Agent request controls:** approval actions use a wrapping row and bounded padded descriptions. Approval decisions and question answers show pending states and prevent duplicate submissions; question fields lock while sending and retain selected answers after failure. Typed native forms share the same action row. An isolated IPC failure fixture verifies one submission from repeated clicks, locked controls and retry recovery in both themes/window sizes. This verifies renderer behavior; live native approval delivery retains its separate protocol/runtime tests.

28. **File and Git review:** reuse the conversation code surface for file previews and staged/unstaged diffs, including offline highlighting and exact-source copying. Separate unstaged/staged headings and specific empty states clarify what will be committed. Changed-file rows use consistent insets, wrap long paths and align staging controls. An owned real Git repository verifies TypeScript and diff colours, exact Unicode/newline copying and row layout in both themes/window sizes.

29. **Attachment preview:** use the shared text/code surface for exact copying and offline highlighting, keep the modal within the window with a 24-pixel inset, and scroll long content independently. Failed reads offer Retry and preserve the provider error without transport prefixes. Escape closes the modal and explicitly restores focus to its trigger. An owned stored-attachment fixture verifies loading, failure/retry, Unicode/newline copying, bounded scrolling, modal containment and native Escape/focus behavior in both themes/window sizes. The packaged workflow separately verifies PDF text extraction and preview.

30. **Command search:** show task-loading and retry feedback, wrap long result titles and preserve newer metadata events over a delayed initial read. Active-option scrolling follows the actual bounded index; empty results remove its reference. Escape and explicit close restore the initiating control, while native modal opening focuses search. Owned overview fixtures verify loading/failure/retry, empty results, stale-response isolation and native Escape/focus behavior in both themes/window sizes.

31. **Terminals:** use the shared task-row treatment for stacked title/status and selected-session emphasis. Saved sessions scroll independently while project selection and New terminal remain visible. Terminal controls use shared sizing; working directories wrap. Close/delete controls disable during mutations. A 30-session stored-transcript fixture verifies list scrolling, retained controls, selection semantics and usable terminal space in both themes/window sizes; existing PTY workflow checks retain execution coverage.

32. **Account usage:** separate usage buckets and windows, align remaining amounts above full-width meters, and retain reset timestamps, blocked-usage messages and explicit unavailable data. Durations use singular/plural labels and over-limit windows stay at 0% remaining. Rendered account-status fixtures verify meter values/width, blocking and unknown states at both window sizes/themes. These are display fixtures; actual signed-in quota retrieval remains unverified.

33. **Task history navigation:** scroll history rows independently of New task, search and archive controls. Long titles use up to two lines and remain available through the full title attribute; selected rows expose pressed state. The large-history workflow verifies independent scrolling, retained controls and title clamping while preserving paging/retry/navigation behavior.

34. **Project surface consistency:** file navigation uses a 16-pixel inset, the filename and editing actions occupy opposite ends of a wrapping toolbar, and file/Git previews retain the shared code surface's 16-pixel padding, 13-pixel text and square inner corners. Dialog and empty-state headings use the bundled semibold weight. Rendered assertions check preview/navigation insets, text size, inner corners and toolbar alignment at both window sizes/themes.

35. **External editor actions:** project editor selection and refresh use the shared wrapping toolbar; preview actions group Edit, Open and Reveal controls. The browser stays within the window with independently scrolling navigation/code and an editor that fills the available pane. Rendered assertions verify preview/edit containment. The preferred available editor persists. Pending opens disable repeated clicks and errors allow retry. Owned IPC fixtures verify project, file, reveal and Git targets in both themes/window sizes. Separate runtime tests verify paths and launching; these captures do not prove installed editor windows open.

36. **Conversation file references:** project file links use the website's link styling, carry line/column positions into the selected editor, prevent repeated pending opens and show inline failure/retry feedback. Owned IPC fixtures verify the complete requested project/file/position in both themes/window sizes. Native editor argument tests cover launch syntax; installed editor UI navigation remains unverified.

37. **Structured task progress:** show native plan steps with completed counts, readable explanations, explicit status labels (including cancellation) and inert literal text. The card sizes against its conversation pane; steps and original results scroll independently so summary/copy controls remain accessible. A 30-step fixture verifies counts, statuses, containment, scrolling and exact source copying in both themes/window sizes. Separate native protocol/runtime tests cover admission and persistence; these captures do not prove live provider execution.

The sidebar now scrolls independently while Settings and Collapse remain accessible. Application menus align to the selected trigger as text sizes change. The desktop uses the web logo rather than an invented mark.

![Home](screenshots/ai-workspace.png)

![Home in dark mode](screenshots/ai-workspace-dark.png)

![Missions](screenshots/missions.png)

![Accounts at minimum window size](screenshots/accounts-small-window.png)

![Add account at minimum window size](screenshots/add-account-small-window.png)

![Account editing at minimum window size](screenshots/account-editor-small-window.png)

![Conversation at minimum window size](screenshots/conversation-small-window.png)

![Account usage at minimum window size](screenshots/account-usage-small-window.png)

![Saved terminal at minimum window size](screenshots/terminal-small-window.png)

![Command search at minimum window size](screenshots/commands-small-window.png)

![Attachment preview at minimum window size](screenshots/attachment-preview-small-window.png)

![File preview at minimum window size](screenshots/project-preview-small-window.png)

![Git review at minimum window size](screenshots/git-review-small-window.png)

![Agent question retry at minimum window size](screenshots/agent-requests-small-window.png)

![Expanded tool result at minimum window size](screenshots/tool-result-small-window.png)

![Editing queued messages at minimum window size](screenshots/queued-messages-small-window.png)

![Reading older history in the Windows package](screenshots/reading-history.png)

![Conversation settings at minimum window size](screenshots/conversation-settings-small-window.png)

![Highlighted code in the Windows package](screenshots/code-highlight-small-window.png)

![Conversation file reference retry at minimum window size](screenshots/file-reference-small-window.png)

![Structured task progress at minimum window size](screenshots/task-progress-small-window.png)

![Platform](screenshots/platform.png)

38. **Select controls and workspace identity:** dropdown triggers use the website's 16-pixel chevron, 32-pixel control height, bundled font and reserved text/arrow spacing. Native option menus follow the selected light/dark scheme. Forced-colour mode retains the native arrow. The current single workspace is an identity label rather than an inactive switching button. Source and packaged rendered checks verify select styling and the identity semantics across pages in both themes/window sizes. Native menus and forced-colour rendering require separate platform checks.

39. **Individual change review:** a selected file uses one padded panel with aligned wrapping actions and the shared highlighted code surface. The aggregate diff is replaced while this review is open, avoiding repeated content. Source and packaged real-repository checks verify 16-pixel insets, Montserrat and no document overflow at both window sizes in light/dark themes.

![Individual changes at the small window size](screenshots/git-hunks-small-window.png)

40. **Git workflow hierarchy:** review and commit controls precede worktree creation. A native disclosure keeps its branch/ref form collapsed until needed, with a 16-pixel gap when expanded. The branch selector no longer repeats the current branch name. Source and packaged workflow checks create a real checkout through the expanded form; four extra rendered captures check both themes/window sizes.

![Worktree controls](screenshots/worktree-form.png)

41. **Split and unified review:** the selected layout applies to aggregate and individual changes and persists across navigation. Paired code columns retain original line numbers, wrap long context and align both sides at minimum width. The lazily loaded Pierre viewer uses offline GitHub light/dark themes, Montserrat headers and shared copy feedback. Source and packaged checks cover literal source markup, Unicode paths, layout persistence, exact copy/retry and raw fallback for a mixed binary/text review. Eight additional captures are produced by `scripts/git-hunks-smoke.mjs`. Virtualization and full keyboard/screen-reader review remain unverified.

![Side-by-side code review](screenshots/git-review-split.png)

42. **Expanded code context:** aggregate reviews load unchanged lines within the existing bounded pane. Pending and refresh actions share padded feedback rows. Real source and packaged workflows verify stale recovery, one request for repeated expansion, exact staged/worktree versions and Enter/Space activation. Eight extra context captures cover both layouts, themes and window sizes. Binary, invalid UTF-8 and oversized files reject expansion with local feedback.

![Expanded context at minimum window size](screenshots/git-context-small-window.png)

43. **Web card and focus treatment:** panels use the website card’s capped 24-pixel radius derived from its 10-pixel base token. Headings no longer reserve description spacing when no description is present. Header, sidebar and native-menu buttons use the website focus-ring colour rather than the platform accent. The packaged audit checks computed panel/heading styles and header focus in both themes/window sizes. Grok task setup now names its own account and native permissions.

![Website card and focus treatment](screenshots/web-card-focus-small-window.png)

44. **Conversation space:** task setup scrolls within the detail pane when taller than the window. Settings retain fixed Save/Cancel actions while their fields scroll within a bounded section. Composer resizing is capped to preserve reading space. The packaged audit enlarges the composer to its limit with settings open, checks reachable Save and visible composer controls, and requires at least 70 pixels of transcript in both window sizes/themes.

![Bounded conversation settings](screenshots/conversation-settings-bounded.png)

45. **Task creation feedback:** a native disabled fieldset locks project, harness, account and model controls while creating or importing. A synchronous guard blocks repeated creation, handoff and import entry. Creating/Importing labels identify the pending action. The owned Electron fixture delays creation, double-clicks, rejects it, checks preserved field values and clean error copy, retries and verifies one durable task. Handoff also verifies one durable result for repeated clicks. Two extra small-window dark captures show pending and failure states. No inference is requested by this workflow.

![Task creation pending](screenshots/task-create-pending.png)

46. **Initial native reasoning:** task setup offers the selected OpenAI model’s advertised reasoning choices and native default within the existing two-column form. Model changes and handoff setup reset the prior choice. The catalogue is an owned fixture in the layout audit; source and packaged checks verify choice/reset, retry preservation and saved creation/handoff values. The first native turn and unsupported-model rejection have deterministic runtime/protocol coverage. Live account execution and initial choices for other harnesses remain separate gaps.

![Initial reasoning selection](screenshots/task-initial-reasoning.png)

47. **Initial Grok settings:** the shared setup picker displays Grok’s advertised reasoning choices, switches a Chat selection to Plan, and clears effort when changing harness. Four extra captures cover both themes/window sizes using an owned model fixture. Runtime fixtures verify trusted catalogue validation and persistence before creation/import/handoff, subsequent effort changes, discovery rejection and shutdown. Native packet tests verify validation before prompt submission. Live signed-in execution remains unverified.

![Grok task setup](screenshots/grok-initial-settings.png)

48. **Model discovery recovery:** task setup and conversation settings share a compact feedback row with loading status and a named Retry action outside the field label. Discovery errors omit the Electron transport prefix. Retry preserves typed models and reasoning selections; context changes still reset dependent choices. Source and packaged owned IPC fixtures verify failure, delayed recovery and one request for repeated clicks. The packaged fixture also types a model before retrying. Four additional small-window dark captures cover both forms. Live provider catalogue outages remain unverified.

![Model discovery recovery](screenshots/model-discovery-retry.png)

49. **Idle home layout and native shortcuts:** when no task is running, attention and recent work use the full content width; the zero running count remains in the summary. Active tasks restore the Running panel through overview updates. The owned rendered fixture checks both transitions. Header, search, menus and composer use the host platform's shortcut labels and accessible key descriptions; the composer describes Send or Queue as appropriate. Source and packaged Windows workflows open command search with native Ctrl+K, verify Escape restores focus, and check composition/repeat guards. macOS/Linux execution and live IME behaviour remain unverified.

![Idle home with recent work visible](screenshots/idle-home-small-window.png)

50. **Conversation header:** export, pin, archive, fork and handoff share a labelled Task actions menu; settings remains directly accessible. The title retains at least 300 pixels at both audited window sizes. The menu uses Base UI 1.6.0, the website's existing primitive, with matching typography, 32-pixel rows, shared theme colours and bounded placement. Native Windows Enter, arrow navigation and Escape/focus restoration pass in source and packaged workflows. Four extra captures cover both themes/window sizes. Real owned UI workflows verify both export formats, fork history and parent identity, persisted pin/unpin, archive and handoff. Full screen-reader, macOS/Linux and live provider execution remain unverified.

![Conversation header at minimum width](screenshots/conversation-header-small-window.png)

![Task actions at minimum width](screenshots/task-actions-small-window.png)

51. **Active task actions:** Fork now follows the runtime's running/waiting restriction alongside Handoff and Archive. Pin and export remain available, and settings stays disabled. Owned task-read fixtures publish each active status through the existing overview/detail bridge, click all three disabled actions, and verify no command or handoff transition is delivered. The composer retains its Queue hint. The fixture restores the completed snapshot before continuing the normal workflow. Eight additional captures cover both statuses, themes and window sizes. These fixtures do not establish live provider execution.

![Task actions while running](screenshots/task-actions-running-small-window.png)

52. **Native compaction:** initialized OpenCode conversations offer Compact context in the existing task menu. Confirmed summaries use the bounded result surface, exact copying and literal text rendering. Owned source and packaged fixtures verify theme/window layouts, pending action locks, duplicate suppression, clean failure/retry and preserved composer drafts. Six additional captures bring the audit to 164. Signed-in native execution and compaction for other engines remain unverified.

![Native compaction summary](screenshots/native-compaction-small-window.png)

53. **Conversation alignment and list spacing:** transcript and composer share an 800-pixel maximum reading width and 24-pixel minimum gutters. The existing resize observer accounts for the native scrollbar width so both edges align; Jump to latest follows the reading column. Task-history rows use 10-pixel vertical insets and a 6-pixel title/status gap. Source and Windows-archive rendered checks require transcript/composer edges and widths to agree within one pixel at both window sizes/themes. Long-history workflow checks retain reading anchors, pause/follow-latest behavior and delayed resize recovery. Capture count remains 164. This is a targeted spacing improvement; overall visual acceptance remains open.

![Aligned conversation and composer](screenshots/conversation-aligned.png)

54. **OpenAI compaction status:** the shared task menu exposes Compact context for initialized OpenAI tasks. Compaction items without native summary text render a padded status row, with no empty code block or unusable Copy action. Owned source/packaged fixtures verify the rendered status, 16-pixel padding, delivered native menu request and retained draft at both window sizes/themes. Four additional captures bring the audit to 168. The production adapter separately passes against the installed CLI and an owned local provider; this does not establish signed-in service execution.

![Native compaction status](screenshots/openai-compaction-small-window.png)

55. **Claude compaction results:** initialized Claude tasks share the same Compact context menu action. Confirmed boundary metadata and a later no-op explanation occupy the existing bounded result cards; the label Compaction result distinguishes details from a generated summary. Owned source/packaged fixtures check exact metadata/no-op copying, literal markup/Unicode and one delivered menu command per theme/window size. Four extra captures bring the audit to 172. The production adapter separately verifies the installed CLI's empty-history no-op against an isolated profile/endpoint, with no inference request. Signed-in successful compaction and complete visual acceptance remain open.

![Claude native compaction results](screenshots/claude-compaction-small-window.png)

56. **Readable compaction metrics:** confirmed Claude boundaries show native Before/After token counts and Duration in a semantic definition list with 16-pixel insets, 6-pixel label/value gaps and tabular numerals. Optional values remain absent when unavailable; invalid metrics retain the raw result. Original result starts collapsed, while Copy preserves the full native JSON. Runtime tests cover valid zeros, omitted/invalid values and SQLite reopening. Source and packaged UI fixtures verify values, spacing, collapsed data and exact copying across both themes/window sizes. Existing captures are updated; the count remains 172. Overall visual acceptance remains open.

![Readable native compaction metrics](screenshots/compaction-metrics-small-window.png)

57. **Website card spacing:** panel headings, account forms/rows, mission forms, settings fields, Home rows and platform links share the website Card primitive's 20-pixel inset. Headers no longer add a redundant divider; list separators remain between items. Attention descriptions and panel helper text use 14-pixel type. The audit checks header insets, absent header borders and account edit spacing in both themes/window sizes. This is a focused spacing pass; overall visual acceptance remains open.

![Updated desktop card spacing](screenshots/website-card-spacing.png)

58. **Native harness discovery:** the Agents page renders six harness results in a two-column list with 20-pixel card insets and explicit Installed/Unavailable labels. Long native diagnostics remain available in a collapsed disclosure rather than stretching each row. Initial discovery/refresh show Checking; failures stay within the panel and offer Retry; successful empty results have their own message. Existing results survive refresh failures, duplicate refresh clicks issue one request, and unmounted views ignore replies. Owned IPC fixtures cover delayed discovery, failure, retry, empty/recovered results and inert diagnostic text. Twelve additional source/package captures bring the audit to 184. These fixtures prove the UI states, not the user's installed tools or signed-in inference.

![Native harness installation layout](screenshots/native-harnesses-small-window.png)

59. **Argument fields:** ACP agents and local MCP connections use a shared full-width argument fieldset instead of a JSON input. Add focuses the new field; each row has a labelled removal action. Arguments retain spaces, quotes, Unicode and empty values; no trimming or shell parsing is introduced. Fields follow the existing native limits (100 arguments, 10,000 characters each). Source/package UI fixtures verify focus, exact controlled values, removal without changing other rows and 8-pixel row gaps. Source/package desktop smoke checks save a literal five-argument MCP configuration through real preload/IPC and confirm the stored values before editing/archive/restore. Four additional MCP captures bring the visual audit to 188. Native tool execution and general visual acceptance remain separate checks.

![Individual command argument fields](screenshots/command-argument-fields.png)

60. **Separate connection editors:** ACP agent and MCP forms now occupy their own New/Edit cards with the website's 20-pixel inset. Edit scrolls the editor card into view and focuses Name. Native disabled fieldsets prevent changes during save; synchronous admission prevents duplicate submissions before React renders. Failures remain beside the editor and preserve the full draft for retry. Filtered agent/connection lists have explicit empty states. Owned source/package IPC fixtures delay and reject saves, verify frozen fields and one delivered request, then retry through the real runtime and check persisted arguments/reset fields. Sixteen added pending/failure captures bring the audit to 204. The smoke workflow waits for rendered saved rows and released archive controls rather than treating a database update as proof the UI is ready. Source/package workflows cover edit, save, archive and restore. Complete visual acceptance remains open.

![Separate MCP connection editor](screenshots/separate-connection-editor.png)

61. **Pi compaction summaries:** native summaries use the existing conversation Markdown renderer with 16-pixel result padding. Original JSON remains collapsed and copies exactly; untrusted tags stay inert. Four new source/archive captures cover both themes and window sizes. The owned process smoke verifies actual menu delivery and durable results, without claiming installed Pi or provider inference. Complete visual acceptance remains open.

![Pi compaction summary](screenshots/pi-compaction-small-window.png)

62. **Stable activity disclosures:** native disclosure state now survives copy feedback and activity rerenders. Structured plans open once when steps first become available; later updates do not reapply the default. Source/archive browser checks expand a native summary, verify exact copying, reject and retry clipboard access, wait for feedback expiry and confirm a deliberately collapsed result stays collapsed. Four failure captures bring the audit to 212. This fixes a concrete layout jump; overall visual acceptance remains open.

![Activity remains expanded after copy failure](screenshots/activity-copy-failure-small-window.png)

63. **Connection selection feedback:** selecting Edit on an ACP agent or MCP connection clears the previous editor save error before loading the selected configuration. Owned source/archive cases reject a save, select another configuration and verify the new saved arguments, Name focus, 20-pixel inset and absence of another save request. Eight selection captures bring the audit to 220. Existing failed-save draft retention and explicit retry remain covered separately. General visual acceptance remains open.

![Selected MCP editor](screenshots/connection-editor-selection-small-window.png)

64. **Settings recovery and feedback:** Notifications now has in-card loading/saving status, readable load/save errors and explicit Retry actions. Initial load failures keep controls disabled until successful recovery. Save failures retain confirmed preferences; Retry submits the failed selection, with synchronous guards against duplicate change/retry events. Inline feedback uses the website’s 20-pixel inset without a nested error tile. Owned source/archive checks delay and reject reads/saves, verify admission and field states, then retry through the real preference store. Sixteen additional captures bring the audit to 236. Actual OS notification display and complete visual acceptance remain unverified.

![Settings save feedback](screenshots/settings-recovery-small-window.png)

65. **Sidebar selection and collapsed controls:** the active navigation item is revealed after selection, surface/collapse changes and sidebar resizing, without changing row size or moving keyboard focus. Collapsed item, Search, Settings, surface switch and expansion controls have explicit accessible labels, following the website sidebar pattern. Owned source/archive cases exercise resize within the supported 680-pixel minimum, background task navigation from a scrolled list, collapse/expand and Platform-to-workspace Settings navigation. Each helper restores its starting page before subsequent model-discovery cases. Eight captures bring the visual audit to 244. Full screen-reader and multi-platform acceptance remain separate requirements.

![Collapsed desktop sidebar](screenshots/sidebar-collapsed-small-window.png)

## Reproduce and limits

Run `pnpm --filter @phaseo/desktop audit:design`. Captures and DOM size/spacing observations are written to `output/playwright/design-audit/after`. The audit waits for the selected page heading before capturing; conversation settings also wait for a rendered frame and verify their inset. It covers eleven pages plus conversation and settings states at 1440×920 and 1040×680 in light and dark modes: 244 screenshots, including code blocks, account editing, expanded agent commands, agent editing and Grok reasoning settings in each theme/window size.

Focus rings, larger labels and current-page semantics improve readability and navigation. Screenshots do not verify screen-reader operation, complete keyboard focus management, contrast in every state, Windows scaling, macOS/Linux rendering, large histories, or live provider sign-in. Those remain separate checks.

After packaging, `pnpm --filter @phaseo/desktop exec electron scripts/design-audit.mjs --app-entry=out/Phaseo-win32-x64/resources/app.asar/dist/main/index.mjs` runs the same 244 captures against the archive and writes `output/playwright/design-audit/packaged-after`. The Windows archive passes this audit, including offline highlighting and exact code copying through the owned clipboard fixture.
