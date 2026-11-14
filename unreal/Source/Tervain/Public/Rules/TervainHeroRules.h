#pragma once

#include "CoreMinimal.h"
#include "TervainHeroRules.generated.h"

/**
 * Two of the wanderer's rules, mirrored from the web repository's core (src/core/rules/hero.ts) as a worked example
 * of how rules cross over: the numbers come from data/game/tuning.json, the logic is rewritten here line for line,
 * and the core's unit tests (tests/core/rules/hero.test.ts) say what each must do.
 */

/** The stamina meter's values: "hero.stamina" in tuning.json. */
USTRUCT(BlueprintType)
struct TERVAIN_API FTervainStaminaTuning
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Max = 0.f;

	/** Spent per second running. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float SprintPerSecond = 0.f;

	/** A sprint ends at this much and leaves him winded. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float SprintMin = 0.f;

	/** Spent per second at a hard crawl in water. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float SwimSprintPerSecond = 0.f;

	/** Recovered per second: rested, winded, and behind a held guard. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Regen = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float RegenWinded = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float RegenGuarding = 0.f;

	/** Winded until the meter is back above this. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float RecoverAbove = 0.f;

	/** Seconds before recovery starts again after running. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float PauseAfterSprint = 0.f;
};

/** The stamina meter. */
USTRUCT(BlueprintType)
struct TERVAIN_API FTervainStaminaState
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tervain")
	float Stamina = 0.f;

	/** Seconds left before recovery may start. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tervain")
	float Pause = 0.f;

	/** Winded: no sprint, dodge or heavy blow until the meter recovers. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tervain")
	bool bExhausted = false;
};

/** What he is spending stamina on this step, if anything. */
UENUM(BlueprintType)
enum class ETervainStaminaDrain : uint8
{
	None,
	Run,
	Swim,
};

/** How a guard meets a blow: "hero.guard", "hero.actionCost.blockHit" and "hero.perfectBlockWindow" in tuning.json. */
USTRUCT(BlueprintType)
struct TERVAIN_API FTervainGuardTuning
{
	GENERATED_BODY()

	/** Stamina a blocked blow costs before the factors below. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float BlockCost = 0.f;

	/** The steady-guard skill's share of that cost. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float SteadyGuard = 1.f;

	/** A heavy blow costs this many times as much to block. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float HeavyCost = 1.f;

	/** With less than this share of the block's cost in hand, the guard is tired. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float TiredBelow = 0.f;

	/** A guard raised within this many seconds of the blow is a perfect block. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float PerfectBlockWindow = 0.f;
};

/** What the wanderer guards with: the share of a blocked blow that still lands. */
USTRUCT(BlueprintType)
struct TERVAIN_API FTervainGuardArms
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float FreshShare = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float TiredShare = 0.f;

	/** Share let through by a perfect block; unused when bPerfectParries. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float PerfectShare = 0.f;

	/** A blade's perfect block turns the blow aside altogether. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	bool bPerfectParries = false;
};

/** The outcome of a blow on a raised guard. */
USTRUCT(BlueprintType)
struct TERVAIN_API FTervainGuardedHit
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Tervain")
	bool bParried = false;

	UPROPERTY(BlueprintReadOnly, Category = "Tervain")
	int32 Damage = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Tervain")
	float Cost = 0.f;

	/** Stamina left after the block. */
	UPROPERTY(BlueprintReadOnly, Category = "Tervain")
	float Stamina = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "Tervain")
	bool bGuardBroken = false;
};

namespace TervainRules
{
	/**
	 * One step of the stamina meter, written back into State. Mirrors staminaStep in src/core/rules/hero.ts.
	 * Returns true while a sprint has run the meter down, which ends the sprint.
	 */
	TERVAIN_API bool StaminaStep(FTervainStaminaState& State, const FTervainStaminaTuning& Tuning, float DeltaSeconds, ETervainStaminaDrain Drain, bool bGuarding);

	/** Settle a blow that lands on a raised guard. Mirrors resolveGuardedHit in src/core/rules/hero.ts. */
	TERVAIN_API FTervainGuardedHit ResolveGuardedHit(const FTervainGuardTuning& Tuning, const FTervainGuardArms& Arms, int32 Damage, bool bHeavy, float BlockSeconds, float Stamina, bool bSteadyGuard);
}
