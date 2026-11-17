#pragma once

#include "CoreMinimal.h"
#include "Math/Vector.h"
#include "TervainBowRules.generated.h"

/**
 * The bow's launch, mirrored from the web repository's core (src/core/rules/bow.ts) as the wanderer's other rules are
 * (TervainHeroRules.h): the numbers come from data/game/tuning.json, the logic is rewritten here line for line, and the
 * core's unit tests (tests/core/rules/bow.test.ts) say what it must do.
 */

/** How an arrow leaves the string and falls: "bow" in tuning.json. The default, without speed, points at the target. */
USTRUCT(BlueprintType)
struct TERVAIN_API FTervainBowTuning
{
	GENERATED_BODY()

	/** Speed (m/s) at which an arrow leaves the string. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float ArrowSpeed = 0.f;

	/** Gravity (m/s^2) an arrow falls under in the air. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Gravity = 1.f;
};

namespace TervainRules
{
	/**
	 * The low ballistic arc from the string to a target Offset away: the unit direction to loose along so that the arrow,
	 * at the tuning's speed under its gravity, passes through it. Out of range, or straight up or down, it points at the
	 * target. Offset and the direction are in the core's axes and metres (x east, y up, z south), as TervainUnits names
	 * them: an engine offset is TervainUnits::UnrealToCore of it, and a core direction (X, Y, Z) is the engine's (X, Z, Y).
	 * Mirrors arrowLaunchDirection in src/core/rules/bow.ts.
	 */
	TERVAIN_API FVector ArrowLaunchDirection(const FTervainBowTuning& Tuning, const FVector& Offset);
}
