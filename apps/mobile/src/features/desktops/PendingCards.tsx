import { Check, ChevronDown, ChevronUp, Square, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Markdown } from "@/components/Markdown";
import { Button, Icon, Text, TextField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import type { DesktopClient } from "./client";
import type { PhoneApproval, PhoneQuestionRequest } from "./protocol";

const CARD = "gap-2.5 rounded-md border border-border bg-card p-4";

/**
 * What the thread waits on, as cards over the composer: approvals (accept or decline only, as the phone can't change
 * permissions) and questions. They scroll when they'd take more than about half the screen.
 */
export function PendingCards({ client, chatId, approvals, questions, onSettled, onStop, onFailure }: {
  client: DesktopClient;
  chatId: string;
  approvals: PhoneApproval[];
  questions: PhoneQuestionRequest[];
  onSettled(kind: "approval" | "question", id: string): void;
  onStop?: (() => void) | null;
  onFailure(title: string, problem: unknown): void;
}) {
  const { height } = useWindowDimensions();
  if (!approvals.length && !questions.length) return null;
  return (
    <ScrollView style={{ maxHeight: height * 0.45 }} className="grow-0" keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 pb-3">
      {approvals.map((approval) => <ApprovalCard key={approval.id} client={client} chatId={chatId} approval={approval} onSettled={() => onSettled("approval", approval.id)} onFailure={onFailure} />)}
      {questions.map((request) => <QuestionCard key={request.id} client={client} chatId={chatId} request={request} onSettled={() => onSettled("question", request.id)} onStop={onStop} onFailure={onFailure} />)}
    </ScrollView>
  );
}

function ApprovalCard({ client, chatId, approval, onSettled, onFailure }: { client: DesktopClient; chatId: string; approval: PhoneApproval; onSettled(): void; onFailure(title: string, problem: unknown): void }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const answer = async (decision: "accept" | "decline") => {
    setBusy(decision);
    haptic("press");
    try {
      await client.request("answer_approval", { chatId, approvalId: approval.id, decision });
      onSettled();
    } catch (problem) {
      onFailure("Couldn't answer", problem);
    } finally {
      setBusy(null);
    }
  };
  return (
    <View className={CARD}>
      <Text variant="caption" className="font-semibold">{approval.plan ? "Plan ready" : "Approval needed"}</Text>
      <Text variant="heading">{approval.plan ? "Proposed plan" : approval.title}</Text>
      {approval.plan ? <Markdown text={approval.description} /> : approval.description ? <Text variant="muted" selectable numberOfLines={12}>{approval.description}</Text> : null}
      <View className="flex-row flex-wrap gap-2.5">
        <Button label={approval.plan ? "Accept the plan" : "Accept"} icon={Check} loading={busy === "accept"} disabled={busy != null} onPress={() => void answer("accept")} />
        <Button label="Decline" icon={X} variant="danger" loading={busy === "decline"} disabled={busy != null} onPress={() => void answer("decline")} />
      </View>
    </View>
  );
}

function QuestionCard({ client, chatId, request, onSettled, onStop, onFailure }: { client: DesktopClient; chatId: string; request: PhoneQuestionRequest; onSettled(): void; onStop?: (() => void) | null; onFailure(title: string, problem: unknown): void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const count = request.questions.length;
  const answers = Object.fromEntries(request.questions.map((question) => {
    const typed = other[question.id]?.trim();
    return [question.id, [...(chosen[question.id] ?? []), ...(typed ? [typed] : [])]];
  }));
  const complete = request.questions.every((question) => (answers[question.id]?.length ?? 0) > 0);
  const toggle = (questionId: string, label: string, multi: boolean) => setChosen((current) => {
    const now = current[questionId] ?? [];
    const next = now.includes(label) ? now.filter((value) => value !== label) : multi ? [...now, label] : [label];
    return { ...current, [questionId]: next };
  });
  const submit = async () => {
    setBusy(true);
    haptic("press");
    try {
      await client.request("answer_question", { chatId, questionId: request.id, answers });
      onSettled();
    } catch (problem) {
      onFailure("Couldn't send the answers", problem);
    } finally {
      setBusy(false);
    }
  };

  if (collapsed) {
    return (
      <View className="flex-row items-center gap-2 rounded-md border border-border bg-card py-1.5 pl-4 pr-1.5">
        <Pressable accessibilityRole="button" accessibilityLabel={`Expand user input, ${count} ${count === 1 ? "question" : "questions"}`} onPress={() => setCollapsed(false)} className="min-h-10 flex-1 flex-row items-center gap-2 active:opacity-70">
          <Text variant="caption" className="font-semibold">User input needed</Text>
          <Text variant="caption">{`${count} ${count === 1 ? "question" : "questions"}`}</Text>
          <View className="flex-1" />
          <Icon icon={ChevronUp} tone="muted" size={13} />
        </Pressable>
        {onStop ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Stop" onPress={onStop} className="h-9 w-9 items-center justify-center rounded-md bg-destructive active:opacity-80">
            <Icon icon={Square} tone="destructive-foreground" size={13} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View className={CARD}>
      <Pressable accessibilityRole="button" accessibilityLabel="Collapse user input" onPress={() => setCollapsed(true)} className="flex-row items-start gap-2">
        <View className="flex-1 gap-2.5">
          <Text variant="caption" className="font-semibold">User input needed</Text>
          <Text variant="heading">Fill in the pending answers</Text>
        </View>
        <View className="h-8 w-8 items-center justify-center rounded-md bg-muted">
          <Icon icon={ChevronDown} tone="muted" size={13} />
        </View>
      </Pressable>
      {request.questions.map((question) => (
        <View key={question.id} className="gap-2 pt-1">
          {question.header ? <Text variant="caption" className="font-bold">{question.header}</Text> : null}
          <Text variant="muted" selectable className="text-foreground">{question.question}</Text>
          {question.options?.map((option) => {
            const selected = (chosen[question.id] ?? []).includes(option.label);
            return (
              <Pressable
                key={option.label}
                accessibilityRole={question.multiSelect ? "checkbox" : "radio"}
                accessibilityState={{ checked: selected, disabled: busy }}
                disabled={busy}
                onPress={() => toggle(question.id, option.label, Boolean(question.multiSelect))}
                className={cn("min-h-12 w-full gap-0.5 rounded-md border px-3.5 py-3", selected ? "border-primary bg-primary/10" : "border-border bg-background")}
              >
                <Text variant="label" className={cn(!selected && "text-muted-foreground")}>{option.label}</Text>
                {option.description && option.description !== option.label ? <Text variant="muted">{option.description}</Text> : null}
              </Pressable>
            );
          })}
          {question.isOther || !question.options?.length ? (
            <TextField
              value={other[question.id] ?? ""}
              onChangeText={(text) => setOther((current) => ({ ...current, [question.id]: text }))}
              placeholder={question.options?.length ? "Something else" : "Your answer"}
              secureTextEntry={question.isSecret}
              accessibilityLabel={question.question}
            />
          ) : null}
        </View>
      ))}
      <Button label="Submit answers" variant={complete ? "primary" : "secondary"} loading={busy} disabled={!complete || busy} onPress={() => void submit()} />
    </View>
  );
}
