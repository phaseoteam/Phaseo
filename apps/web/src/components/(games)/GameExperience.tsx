"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelSearchDropdown } from "@/components/model-picker/ModelSearchDropdown";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { readGameState, writeGameState } from "./gameStorage";
import { GameModelIdentity } from "./GameModelIdentity";
import { SprintGame } from "./SprintGame";
import { checkPuzzle, fetchDailyPuzzle } from "@/lib/games/client";
import {
  GAME_INFO,
  GAME_KEYS,
  type DailyPuzzle,
  type Direction,
  type GameKey,
  type HeadToHeadPuzzle,
  type Match,
  type ModelCandidate,
  type ModelePuzzle,
  type ModeleResult,
  type PricelePuzzle,
  type PriceleResult,
  type TimelinePuzzle,
} from "@/lib/games/types";

const GAME_CARD_CLASS =
  "gap-3 rounded-lg py-3 [--card-spacing:--spacing(3)]";

const GAME_INSTRUCTIONS: Record<GameKey, string> = {
  modele:
    "Choose a model, then use developer, origin, access, release, modality, provider and family clues to narrow the answer.",
  pricele:
    "Guess the model from its token prices. Arrows show whether the answer’s price is higher or lower.",
  timeline:
    "Reorder the five models from oldest to newest, then submit the sequence.",
  "head-to-head":
    "Choose the model that wins each catalogue comparison across five rounds.",
  sprint:
    "Name as many matching models as possible before the sixty-second timer expires.",
};

function GameHowTo({ game }: { game: GameKey }) {
  return (
    <aside className="mt-10 border-t border-border/70 pt-5 text-sm">
      <h2 className="font-heading font-medium">How to play</h2>
      <p className="mt-1 max-w-3xl leading-6 text-muted-foreground">
        {GAME_INSTRUCTIONS[game]}
      </p>
      {game === "modele" ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-sm bg-emerald-500/70" /> Exact
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-sm bg-amber-500/70" /> Partial
          </span>
          <span>↑ ↓ The answer is higher or lower</span>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground/75">
        Inspired by Wordle and the tradition of daily browser puzzles.
      </p>
    </aside>
  );
}

function GameScaffold({
  game,
  date,
  children,
}: {
  game: GameKey;
  date: string;
  children: React.ReactNode;
}) {
  const info = GAME_INFO[game];
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl [&_[data-slot=button]]:rounded-lg">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Button asChild variant="ghost" className="rounded-lg">
            <Link href="/games">
              <ArrowLeft data-icon="inline-start" />
              All games
            </Link>
          </Button>
          <Badge variant="outline">Daily · {date}</Badge>
        </div>
        <header className="mb-8 max-w-3xl">
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            {info.title}
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            {info.description}
          </p>
        </header>
        <nav
          aria-label="Catalogue games"
          className="mb-8 flex gap-2 overflow-x-auto pb-2"
        >
          {GAME_KEYS.map((key) => (
            <Button
              key={key}
              asChild
              size="sm"
              variant={key === game ? "default" : "outline"}
              className="rounded-lg"
            >
              <Link href={GAME_INFO[key].path}>{GAME_INFO[key].title}</Link>
            </Button>
          ))}
        </nav>
        {children}
        <GameHowTo game={game} />
      </div>
    </main>
  );
}

function ModelPicker({
  candidates,
  disabled,
  usedIds = [],
  onPick,
  buttonLabel = "Guess",
}: {
  candidates: ModelCandidate[];
  disabled?: boolean;
  usedIds?: string[];
  onPick: (candidate: ModelCandidate) => Promise<void>;
  buttonLabel?: string;
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const available = useMemo(
    () => candidates.filter((candidate) => !usedIds.includes(candidate.id)),
    [candidates, usedIds]
  );
  const selected = available.find((candidate) => candidate.id === value);
  const options = useMemo(
    () =>
      available.map((candidate) => ({
        value: candidate.id,
        label: candidate.name,
        description: candidate.labName,
        logoId: candidate.labSlug ?? candidate.id.split("/")[0],
      })),
    [available]
  );
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!selected || pending) return;
        setPending(true);
        try {
          await onPick(selected);
          setValue("");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <ModelSearchDropdown
          value={value}
          onValueChange={setValue}
          options={options}
          open={open}
          onOpenChange={setOpen}
          disabled={disabled || pending}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={disabled || pending || !selected}
      >
        {pending ? <Loader2 className="animate-spin" /> : buttonLabel}
      </Button>
    </form>
  );
}

function clueTone(match?: Match, direction?: Direction): string {
  const value = match ?? direction;
  if (value === "correct")
    return "bg-emerald-500/15 ring-emerald-500/30 text-emerald-800 dark:text-emerald-200";
  if (value === "partial")
    return "bg-amber-500/15 ring-amber-500/30 text-amber-800 dark:text-amber-200";
  if (value === "wrong" || value === "higher" || value === "lower")
    return "bg-muted ring-foreground/10";
  return "bg-muted/40 ring-foreground/5 text-muted-foreground";
}

function valueText(value: unknown): string {
  if (Array.isArray(value))
    return value.map((item) => String(item).replaceAll("_", " ")).join(", ");
  if (value == null || value === "") return "Unknown";
  return String(value).replaceAll("_", " ");
}

function DirectionIcon({ direction }: { direction?: Direction }) {
  if (direction === "higher")
    return <ArrowUp className="size-3.5" aria-label="The answer is higher" />;
  if (direction === "lower")
    return <ArrowDown className="size-3.5" aria-label="The answer is lower" />;
  if (direction === "correct")
    return <Check className="size-3.5" aria-label="Correct" />;
  return null;
}

const CLUE_LABELS: Record<string, string> = {
  developer: "Developer",
  country: "Origin",
  access: "Access",
  releaseYear: "Release",
  inputModalities: "Input",
  outputModalities: "Output",
  providers: "Providers",
  family: "Family",
};

type GuessState<T> = { guesses: T[]; answer: ModelCandidate | null };

function ModeleGame({ puzzle }: { puzzle: ModelePuzzle }) {
  const [state, setState] = useState<GuessState<ModeleResult>>(() =>
    readGameState("modele", puzzle.puzzleId, { guesses: [], answer: null })
  );
  const finished =
    Boolean(state.answer) || state.guesses.length >= puzzle.maxGuesses;
  const save = (next: GuessState<ModeleResult>) => {
    setState(next);
    writeGameState("modele", puzzle.puzzleId, next);
  };
  const reveal = async () => {
    const result = await checkPuzzle<{ answer: ModelCandidate }>(
      "modele",
      puzzle.puzzleId,
      { action: "reveal", attempts: state.guesses.length }
    );
    save({ ...state, answer: result.answer });
  };
  return (
    <div className="space-y-5">
      <Card className={GAME_CARD_CLASS}>
        <CardHeader>
          <CardTitle>Guess today’s model</CardTitle>
          <CardDescription>
            Green is exact, amber is partial, and arrows point towards the
            answer. “Origin” means the developer’s country.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModelPicker
            candidates={puzzle.candidates}
            usedIds={state.guesses.map((guess) => guess.model.id)}
            disabled={finished}
            onPick={async (candidate) => {
              const result = await checkPuzzle<ModeleResult>(
                "modele",
                puzzle.puzzleId,
                { guessId: candidate.id, attempts: state.guesses.length + 1 }
              );
              const nextGuesses = [...state.guesses, result];
              if (result.answer)
                save({ guesses: nextGuesses, answer: result.answer });
              else if (nextGuesses.length >= puzzle.maxGuesses) {
                const revealed = await checkPuzzle<{ answer: ModelCandidate }>(
                  "modele",
                  puzzle.puzzleId,
                  { action: "reveal", attempts: nextGuesses.length }
                );
                save({ guesses: nextGuesses, answer: revealed.answer });
              } else save({ guesses: nextGuesses, answer: null });
            }}
          />
        </CardContent>
      </Card>
      <div aria-live="polite" className="text-sm text-muted-foreground">
        {state.guesses.length} / {puzzle.maxGuesses} guesses
      </div>
      {[...state.guesses].reverse().map((guess, reverseIndex) => (
        <Card key={guess.model.id} size="sm" className={GAME_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <GameModelIdentity model={guess.model} />
              <Badge variant="secondary" className="shrink-0">
                Guess {state.guesses.length - reverseIndex}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
              {Object.entries(guess.clues).map(([key, clue]) => (
                <div
                  key={key}
                  className={cn(
                    "min-h-16 rounded-lg p-3 ring-1",
                    clueTone(clue.match, clue.direction)
                  )}
                >
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                    {CLUE_LABELS[key] ?? key}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-medium capitalize">
                    <DirectionIcon direction={clue.direction} />
                    {valueText(clue.value)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      {state.answer && (
        <ResultCard
          success={state.guesses.some((guess) => guess.correct)}
          title={
            state.guesses.some((guess) => guess.correct)
              ? "You found it"
              : "That was a tricky one"
          }
          answer={state.answer}
        />
      )}
      {finished && !state.answer && (
        <Button variant="outline" onClick={reveal}>
          Reveal answer
        </Button>
      )}
    </div>
  );
}

function ResultCard({
  success,
  title,
  answer,
}: {
  success: boolean;
  title: string;
  answer?: ModelCandidate | null;
}) {
  return (
    <Card
      className={cn(
        GAME_CARD_CLASS,
        success ? "ring-emerald-500/30" : "ring-amber-500/30"
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {success ? (
            <Check className="text-emerald-600" />
          ) : (
            <X className="text-amber-600" />
          )}
          {title}
        </CardTitle>
        {answer && (
          <CardDescription className="flex items-center gap-2">
            <span>The answer is</span>
            <GameModelIdentity model={answer} compact />
          </CardDescription>
        )}
      </CardHeader>
    </Card>
  );
}

function PriceleGame({ puzzle }: { puzzle: PricelePuzzle }) {
  const format = useDisplayFormatters();
  const formatPrice = (value: number) =>
    format.number(value, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 6,
      notation: "standard",
    });
  const [state, setState] = useState<GuessState<PriceleResult>>(() =>
    readGameState("pricele", puzzle.puzzleId, { guesses: [], answer: null })
  );
  const finished =
    Boolean(state.answer) || state.guesses.length >= puzzle.maxGuesses;
  const save = (next: GuessState<PriceleResult>) => {
    setState(next);
    writeGameState("pricele", puzzle.puzzleId, next);
  };
  return (
    <div className="space-y-5">
      <Card className={GAME_CARD_CLASS}>
        <CardHeader>
          <CardTitle>Follow the price</CardTitle>
          <CardDescription>
            {puzzle.priceBasis}. Arrows point towards the answer’s price.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModelPicker
            candidates={puzzle.candidates}
            usedIds={state.guesses.map((guess) => guess.model.id)}
            disabled={finished}
            onPick={async (candidate) => {
              const result = await checkPuzzle<PriceleResult>(
                "pricele",
                puzzle.puzzleId,
                { guessId: candidate.id, attempts: state.guesses.length + 1 }
              );
              const guesses = [...state.guesses, result];
              if (result.answer) save({ guesses, answer: result.answer });
              else if (guesses.length >= puzzle.maxGuesses) {
                const revealed = await checkPuzzle<{ answer: ModelCandidate }>(
                  "pricele",
                  puzzle.puzzleId,
                  { action: "reveal", attempts: guesses.length }
                );
                save({ guesses, answer: revealed.answer });
              } else save({ guesses, answer: null });
            }}
          />
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {state.guesses.map((guess) => (
          <Card key={guess.model.id} size="sm" className={GAME_CARD_CLASS}>
            <CardContent className="grid gap-3 sm:grid-cols-[1fr_180px_180px] sm:items-center">
              <GameModelIdentity model={guess.model} compact />
              {(["input", "output"] as const).map((direction) => (
                <div
                  key={direction}
                  className={cn(
                    "rounded-lg p-3 ring-1",
                    clueTone(undefined, guess.prices[direction].direction)
                  )}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                    {direction}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 font-medium">
                    <DirectionIcon
                      direction={guess.prices[direction].direction}
                    />
                    {formatPrice(guess.prices[direction].value)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {state.answer && (
        <ResultCard
          success={state.guesses.some((guess) => guess.correct)}
          title={
            state.guesses.some((guess) => guess.correct)
              ? "Right on the money"
              : "Price locked"
          }
          answer={state.answer}
        />
      )}
    </div>
  );
}

type TimelineResult = {
  correct: boolean;
  score: number;
  correctOrder: string[];
  dates: Record<string, string>;
};

function TimelineGame({ puzzle }: { puzzle: TimelinePuzzle }) {
  const initial = {
    order: puzzle.models,
    result: null as TimelineResult | null,
  };
  const [state, setState] = useState(() =>
    readGameState("timeline", puzzle.puzzleId, initial)
  );
  const save = (next: typeof state) => {
    setState(next);
    writeGameState("timeline", puzzle.puzzleId, next);
  };
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= state.order.length) return;
    const order = [...state.order];
    [order[index], order[target]] = [
      order[target] as ModelCandidate,
      order[index] as ModelCandidate,
    ];
    save({ order, result: null });
  };
  const displayed = state.result
    ? state.result.correctOrder.map(
        (id) => state.order.find((model) => model.id === id) as ModelCandidate
      )
    : state.order;
  return (
    <div className="space-y-5">
      <Card className={GAME_CARD_CLASS}>
        <CardHeader>
          <CardTitle>Oldest → newest</CardTitle>
          <CardDescription>
            Move the five models into release order, then lock in your timeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {displayed.map((model, index) => (
            <div
              key={model.id}
              className="flex items-center gap-3 rounded-lg bg-muted/50 p-3 ring-1 ring-foreground/5"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-sm font-semibold ring-1 ring-foreground/10">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <GameModelIdentity model={model} compact />
                {state.result ? (
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {state.result.dates[model.id]}
                  </div>
                ) : null}
              </div>
              {!state.result && (
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${model.name} earlier`}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={index === state.order.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${model.name} later`}
                  >
                    <ChevronDown />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!state.result && (
            <Button
              size="lg"
              className="w-full"
              onClick={async () => {
                const result = await checkPuzzle<TimelineResult>(
                  "timeline",
                  puzzle.puzzleId,
                  { order: state.order.map((model) => model.id) }
                );
                save({ ...state, result });
              }}
            >
              Lock in timeline
            </Button>
          )}
        </CardContent>
      </Card>
      {state.result && (
        <ResultCard
          success={state.result.correct}
          title={
            state.result.correct
              ? "Perfect timeline"
              : `${state.result.score} of 5 in the exact position`
          }
        />
      )}
    </div>
  );
}

type HeadResult = {
  score: number;
  results: Record<
    string,
    {
      correct: boolean;
      winner: "left" | "right";
      leftValue: unknown;
      rightValue: unknown;
    }
  >;
};

function HeadToHeadGame({ puzzle }: { puzzle: HeadToHeadPuzzle }) {
  const initial = {
    answers: {} as Record<string, "left" | "right">,
    result: null as HeadResult | null,
  };
  const [state, setState] = useState(() =>
    readGameState("head-to-head", puzzle.puzzleId, initial)
  );
  const save = (next: typeof state) => {
    setState(next);
    writeGameState("head-to-head", puzzle.puzzleId, next);
  };
  return (
    <div className="space-y-4">
      {puzzle.rounds.map((round, index) => {
        const result = state.result?.results[round.id];
        return (
          <Card key={round.id} className={GAME_CARD_CLASS}>
            <CardHeader>
              <CardDescription>
                Round {index + 1} of {puzzle.rounds.length}
              </CardDescription>
              <CardTitle>{round.label}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
              <HeadChoice
                candidate={round.left}
                selected={state.answers[round.id] === "left"}
                disabled={Boolean(state.result)}
                value={result?.leftValue}
                correct={result?.winner === "left"}
                onClick={() =>
                  save({
                    ...state,
                    answers: { ...state.answers, [round.id]: "left" },
                  })
                }
              />
              <div className="self-center text-xs font-semibold text-muted-foreground">
                VS
              </div>
              <HeadChoice
                candidate={round.right}
                selected={state.answers[round.id] === "right"}
                disabled={Boolean(state.result)}
                value={result?.rightValue}
                correct={result?.winner === "right"}
                onClick={() =>
                  save({
                    ...state,
                    answers: { ...state.answers, [round.id]: "right" },
                  })
                }
              />
            </CardContent>
          </Card>
        );
      })}
      <Button
        size="lg"
        className="w-full"
        disabled={
          Boolean(state.result) ||
          Object.keys(state.answers).length !== puzzle.rounds.length
        }
        onClick={async () => {
          const result = await checkPuzzle<HeadResult>(
            "head-to-head",
            puzzle.puzzleId,
            { answers: state.answers }
          );
          save({ ...state, result });
        }}
      >
        {state.result
          ? `${state.result.score} / ${puzzle.rounds.length}`
          : "Reveal winners"}
      </Button>
      {state.result && (
        <ResultCard
          success={state.result.score === puzzle.rounds.length}
          title={
            state.result.score === puzzle.rounds.length
              ? "Clean sweep"
              : `${state.result.score} of ${puzzle.rounds.length} correct`
          }
        />
      )}
    </div>
  );
}

function HeadChoice({
  candidate,
  selected,
  disabled,
  value,
  correct,
  onClick,
}: {
  candidate: ModelCandidate;
  selected: boolean;
  disabled: boolean;
  value?: unknown;
  correct?: boolean;
  onClick: () => void;
}) {
  const format = useDisplayFormatters();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-w-0 rounded-lg p-4 text-left ring-1 transition-colors disabled:cursor-default",
        selected
          ? "bg-foreground text-background ring-foreground"
          : "bg-muted/40 ring-foreground/10 hover:bg-muted",
        correct && "bg-emerald-500/15 text-foreground ring-emerald-500/40"
      )}
    >
      <GameModelIdentity
        model={candidate}
        className={cn(
          "text-sm sm:text-lg",
          selected &&
            !correct &&
            "[&>span:last-child]:text-background/70"
        )}
      />
      {value != null && (
        <div className="mt-3 text-sm font-semibold">
          {typeof value === "number" ? format.number(value) : String(value)}
        </div>
      )}
    </button>
  );
}

function PuzzleView({ puzzle }: { puzzle: DailyPuzzle }) {
  if (puzzle.game === "modele") return <ModeleGame puzzle={puzzle} />;
  if (puzzle.game === "timeline") return <TimelineGame puzzle={puzzle} />;
  if (puzzle.game === "pricele") return <PriceleGame puzzle={puzzle} />;
  if (puzzle.game === "head-to-head") return <HeadToHeadGame puzzle={puzzle} />;
  return <SprintGame puzzle={puzzle} />;
}

export function GameExperience({ game }: { game: GameKey }) {
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    fetchDailyPuzzle(game)
      .then((value) => {
        if (active) setPuzzle(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [game]);
  if (error)
    return (
      <GameScaffold game={game} date="Today">
        <Card className={GAME_CARD_CLASS}>
          <CardHeader>
            <CardTitle>Puzzle unavailable</CardTitle>
            <CardDescription>
              The catalogue service could not prepare today’s game. Try again in
              a moment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RotateCcw />
              Try again
            </Button>
          </CardContent>
        </Card>
      </GameScaffold>
    );
  if (!puzzle)
    return (
      <GameScaffold game={game} date="Today">
        <div className="flex min-h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 animate-spin" />
          Preparing today’s puzzle…
        </div>
      </GameScaffold>
    );
  return (
    <GameScaffold game={game} date={puzzle.date}>
      <PuzzleView key={puzzle.puzzleId} puzzle={puzzle} />
    </GameScaffold>
  );
}
