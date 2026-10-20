import { Check, Share2, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, EmptyState, ErrorState, Header, Icon, LoadingState, ReadableWidth, Screen, Text, toastError } from "@/components/ui";
import { useCatalogue } from "@/features/models/state";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { buildPool, describeFigure, pickRound, QUESTIONS, shareMessage, type Contestant, type Round, type Side } from "./higherOrLower";
import { higherOrLowerStore, recordStreak } from "./higherOrLowerStore";

/** Models that sit out for a few rounds after playing, so the same faces don't keep coming back. */
const RESTING = 8;

/**
 * Higher or lower, the game inside the version art (hold the Phaseo mark there): two models from the live catalogue
 * and a question about their prices, context windows or release dates. Each right answer adds to the streak; the
 * best streak stays on this device. It opens full screen on top of the art, so back returns to it.
 */
export function HigherOrLowerScreen() {
  const { split } = useLayout();
  const catalogue = useCatalogue();
  const best = higherOrLowerStore.use((state) => state.best);
  // Releases count once they're before the catalogue was fetched.
  const pool = useMemo(() => buildPool(catalogue.data?.models ?? [], catalogue.dataUpdatedAt), [catalogue.data, catalogue.dataUpdatedAt]);
  // Undefined until the first deal; null when the catalogue has no pair that can play.
  const [round, setRound] = useState<Round | null | undefined>(undefined);
  const [pick, setPick] = useState<Side | null>(null);
  const [streak, setStreak] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const recent = useRef<string[]>([]);

  const deal = useCallback((previous: Round | null) => {
    const next = pickRound(pool, { recent: recent.current, previous: previous?.kind ?? null });
    if (next) recent.current = [next.left.id, next.right.id, ...recent.current].slice(0, RESTING);
    setRound(next);
    setPick(null);
  }, [pool]);

  useEffect(() => {
    if (round === undefined && pool.length) deal(null);
  }, [deal, pool.length, round]);

  const answer = (side: Side) => {
    if (!round || pick) return;
    setPick(side);
    if (side === round.answer) {
      const next = streak + 1;
      setStreak(next);
      if (recordStreak(next)) setNewBest(true);
      haptic("success");
    } else {
      haptic("error");
    }
  };

  const correct = round != null && pick === round.answer;
  const carryOn = () => {
    if (!correct) {
      setStreak(0);
      setNewBest(false);
    }
    deal(round ?? null);
  };
  const share = () => void Share.share({ message: shareMessage(streak) }).catch((error) => toastError("Couldn't share", error));
  const result = correct
    ? newBest && streak > 1 ? `Right. That's a new best: ${streak} in a row.` : `Right. ${streak} in a row.`
    : streak > 0 ? `Not this time. Your streak was ${streak}.` : "Not this time.";

  return (
    <Screen>
      <Header back title="Higher or lower" />
      <ScrollView contentContainerClassName="pb-16">
        <ReadableWidth>
          {catalogue.isLoading ? <LoadingState /> : catalogue.isError && !catalogue.data ? <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} /> : !round ? (
            round === null || !pool.length ? <EmptyState title="Not enough models to play" body="Try again later, when the catalogue has more models with prices and dates." /> : <LoadingState />
          ) : (
            <View className="px-4">
              <View className="flex-row justify-between gap-3">
                <Text variant="muted">{`Streak ${streak}`}</Text>
                <Text variant="muted">{`Best ${Math.max(best, streak)}`}</Text>
              </View>
              <Text variant="title" accessibilityRole="header" className="mt-4">{QUESTIONS[round.kind].prompt}</Text>
              <View className="mt-4 flex-row gap-3">
                <Choice contestant={round.left} side="left" round={round} pick={pick} onPick={answer} />
                <Choice contestant={round.right} side="right" round={round} pick={pick} onPick={answer} />
              </View>
              {pick ? (
                <View className="mt-5">
                  <Text variant="heading" accessibilityLiveRegion="polite" accessibilityRole="alert">{result}</Text>
                  <View className={cn("mt-4 gap-2", split && "flex-row")}>
                    <Button label={correct ? "Next" : "Play again"} className={split ? "flex-1" : undefined} onPress={carryOn} />
                    {streak > 0 ? <Button label="Share streak" icon={Share2} variant="outline" className={split ? "flex-1" : undefined} onPress={share} /> : null}
                  </View>
                </View>
              ) : <Text variant="muted" className="mt-4">Tap a model to answer.</Text>}
            </View>
          )}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}

/** One side of the round: the lab's logo and the model, then its figure once answered. */
function Choice({ contestant, side, round, pick, onPick }: { contestant: Contestant; side: Side; round: Round; pick: Side | null; onPick(side: Side): void }) {
  const revealed = pick != null;
  const wins = round.answer === side;
  const picked = pick === side;
  const figure = describeFigure(contestant, round.kind);
  const label = revealed
    ? `${contestant.name} by ${contestant.orgName}: ${figure}.${wins ? " The answer." : ""}${picked ? " Your pick." : ""}`
    : `${contestant.name} by ${contestant.orgName}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: picked }}
      onPress={() => onPick(side)}
      className={cn(
        "flex-1 items-center gap-1.5 rounded-md border px-3 py-4",
        !revealed && "active:bg-accent",
        revealed && wins ? "border-success" : revealed && picked ? "border-destructive" : "border-border",
      )}
    >
      <Logo id={contestant.orgId} label={contestant.orgName} colour={contestant.colour} size={44} />
      <Text variant="label" numberOfLines={3} className="mt-1 text-center">{contestant.name}</Text>
      <Text variant="caption" numberOfLines={1} className="text-center">{contestant.orgName}</Text>
      {revealed ? (
        <View className="mt-2 flex-row items-center gap-1">
          {wins ? <Icon icon={Check} tone="success" size={16} /> : picked ? <Icon icon={X} tone="destructive" size={16} /> : null}
          <Text variant="heading" className={cn("text-center", wins && "text-success")}>{figure}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
