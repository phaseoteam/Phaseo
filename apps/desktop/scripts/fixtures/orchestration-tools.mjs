/**
 * Orchestration tools (src/main/threadTools.ts) every Phaseo chat receives in every mode.
 * Gateway fixtures allow them beside each mode's own tools; file and command tools stay mode-restricted.
 * The browser tools come with them while the app has a window; Phaseo chats get no screenshot tool, since their tool results are text.
 */
export const orchestrationTools = ["handoff_thread", "rename_thread", "steer_thread", "read_thread_queue", "edit_thread_queue", "fork_thread", "send_thread", "merge_thread_context", "list_agents", "list_models", "list_threads", "read_thread", "delegate_task", "wait_thread", "interrupt_thread", "launch_thread", "launch_threads", "list_projects", "organize_thread", "link_pull_request", "unlink_pull_request", "watch_pull_request", "unwatch_pull_request", "list_scheduled_tasks", "schedule_task", "update_scheduled_task", "delete_scheduled_task", "run_scheduled_task_now", "browser_tabs", "browser_open", "browser_snapshot", "browser_click", "browser_type"];
