"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { readGameState, writeGameState } from "./gameStorage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { checkPuzzle } from "@/lib/games/client";
import type { ModelCandidate, SprintPuzzle } from "@/lib/games/types";
import { cn } from "@/lib/utils";
import { GameModelIdentity } from "./GameModelIdentity";
import { useTranslations } from "next-intl";

type SprintState = {
  found: ModelCandidate[];
  startedAt: number | null;
  finished: boolean;
  answers: ModelCandidate[] | null;
};

const GAME_CARD_CLASS =
  "gap-3 rounded-lg py-3 [--card-spacing:--spacing(3)]";

export function SprintGame({ puzzle }: { puzzle: SprintPuzzle }) {
  const t = useTranslations("Product.games");
  const initial: SprintState = {
    found: [],
    startedAt: null,
    finished: false,
    answers: null,
  };
  const [state, setState] = useState(() =>
    readGameState("sprint", puzzle.puzzleId, initial)
  );
  const [guess, setGuess] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const finishingRef = useRef(false);
  const save = useCallback(
    (next: SprintState) => {
      setState(next);
      writeGameState("sprint", puzzle.puzzleId, next);
    },
    [puzzle.puzzleId]
  );
  const secondsLeft =
    state.startedAt == null
      ? puzzle.durationSeconds
      : Math.max(
          0,
          puzzle.durationSeconds - Math.floor((now - state.startedAt) / 1_000)
        );
  const finish = useCallback(async () => {
    if (state.finished || finishingRef.current) return;
    finishingRef.current = true;
    try {
      const result = await checkPuzzle<{ answers: ModelCandidate[] }>(
        "sprint",
        puzzle.puzzleId,
        { action: "finish", foundIds: state.found.map((model) => model.id) }
      );
      save({ ...state, finished: true, answers: result.answers });
    } finally {
      finishingRef.current = false;
    }
  }, [puzzle.puzzleId, save, state]);

  useEffect(() => {
    if (state.startedAt == null || state.finished) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [state.finished, state.startedAt]);

  useEffect(() => {
    if (state.startedAt != null && !state.finished && secondsLeft === 0) {
      void finish();
    }
  }, [finish, secondsLeft, state.finished, state.startedAt]);

  return (
    <div className="space-y-5">
      <Card className={GAME_CARD_CLASS}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardDescription>{t("todayCategory")}</CardDescription>
              <CardTitle className="mt-1 text-2xl">
                {puzzle.category.label}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 font-mono text-xl font-semibold">
              <Clock3 className="size-5" />
              {secondsLeft}s
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {state.startedAt == null ? (
            <Button
              size="lg"
              className="w-full rounded-lg"
              onClick={() => {
                const next = { ...state, startedAt: Date.now() };
                setNow(Date.now());
                save(next);
              }}
            >
              {t("startSprint")}
            </Button>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!guess.trim() || state.finished) return;
                const result = await checkPuzzle<{
                  accepted: boolean;
                  model?: ModelCandidate;
                }>("sprint", puzzle.puzzleId, { guess });
                if (
                  result.accepted &&
                  result.model &&
                  !state.found.some((model) => model.id === result.model?.id)
                ) {
                  save({ ...state, found: [...state.found, result.model] });
                }
                setGuess("");
              }}
            >
              <Input
                value={guess}
                onChange={(event) => setGuess(event.target.value)}
                disabled={state.finished}
                autoFocus
                placeholder={t("modelNamePlaceholder")}
                className="h-10 rounded-lg"
              />
              <Button
                type="submit"
                size="lg"
                className="rounded-lg"
                disabled={state.finished || !guess.trim()}
              >
                {t("add")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t("foundCount", { found: state.found.length, total: puzzle.totalAnswers })}
        </div>
        {state.startedAt != null && !state.finished && (
          <Button variant="ghost" size="sm" className="rounded-lg" onClick={finish}>
          {t("finishNow")}
          </Button>
        )}
      </div>
      {state.found.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.found.map((model) => (
            <Badge key={model.id} variant="secondary" className="gap-1.5">
              <GameModelIdentity
                model={model}
                compact
                className="gap-1.5 [&>span:last-child]:hidden"
                logoClassName="size-3.5"
              />
            </Badge>
          ))}
        </div>
      )}
      {state.finished && (
        <Card className={GAME_CARD_CLASS}>
          <CardHeader>
            <CardTitle>{t("sprintComplete")}</CardTitle>
            <CardDescription>
              {t("sprintResult", { found: state.found.length, total: puzzle.totalAnswers })}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {state.answers?.map((model) => (
              <div
                key={model.id}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  state.found.some((found) => found.id === model.id)
                    ? "bg-emerald-500/15"
                    : "bg-muted/50"
                )}
              >
                <GameModelIdentity model={model} compact />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
