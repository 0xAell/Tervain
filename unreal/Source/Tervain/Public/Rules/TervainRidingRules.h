#pragma once

#include "CoreMinimal.h"
#include "TervainRidingRules.generated.h"

/**
 * Riding the saddled deer, mirrored from the web repository's core (src/core/rules/riding.ts) as the wanderer's and the
 * bow's rules are (TervainHeroRules.h, TervainBowRules.h): the numbers come from data/game/tuning.json, the logic is
 * rewritten here line for line, and the core's unit tests (tests/core/rules/ridingRules.test.ts) say what it must do.
 */

/**
 * How the deer answers the reins: "riding.ride" in tuning.json. The default holds the deer as it is: it neither gathers
 * speed, slows nor turns.
 */
USTRUCT(BlueprintType)
struct TERVAIN_API FTervainRideTuning
{
	GENERATED_BODY()

	/** Walking pace (m/s). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Walk = 0.f;

	/** Galloping pace (m/s). Never zero: how far the deer is into its gallop is its speed's share of this. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Run = 1.f;

	/** The slow back-up when steered straight behind (m/s). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Back = 0.f;

	/** Speeding up and slowing down (m/s^2): it gathers itself, and pulls up a little quicker. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Accel = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Brake = 0.f;

	/** Most it can turn (rad/s): sharp from a standstill, wide at a gallop. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float TurnStill = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float TurnRun = 0.f;

	/** Reins this far behind the deer's facing (rad) back it up instead of turning it round. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float BackCone = 0.f;
};

/** The deer's motion under the rider. */
USTRUCT(BlueprintType)
struct TERVAIN_API FTervainRideMotion
{
	GENERATED_BODY()

	/** Speed along its facing (m/s); below zero it is backing up. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tervain")
	float Speed = 0.f;

	/** Its facing, a core yaw (radians, 0 facing +z): TervainUnits::CoreYawToUnreal gives the engine's. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tervain")
	float Yaw = 0.f;
};

/** The gallop's stamina: "riding.stamina" in tuning.json. */
USTRUCT(BlueprintType)
struct TERVAIN_API FTervainMountStaminaTuning
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Max = 0.f;

	/** Spent per second galloping. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Drain = 0.f;

	/** Recovered per second walking or standing. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Tervain")
	float Recover = 0.f;
};

namespace TervainRules
{
	/**
	 * One step of the reins. DirX and DirZ are the way the rider steers (a unit vector in the core's axes, x east and z
	 * south, as TervainUnits names them) and Push how hard (0 to 1). The deer turns toward it at a bounded rate and
	 * speeds up or slows down toward its pace; steered straight behind from a near stand, it backs up slowly. Returns how
	 * fast it turned (rad/s), which the rider leans into. Mirrors steerMount in src/core/rules/riding.ts.
	 */
	TERVAIN_API float SteerMount(FTervainRideMotion& Motion, const FTervainRideTuning& Tuning, float DirX, float DirZ, float Push, bool bGallop, float DeltaSeconds);

	/** The gallop's stamina after one step: drained galloping, recovering otherwise, between empty and full. Mirrors mountStaminaStep. */
	TERVAIN_API float MountStaminaStep(const FTervainMountStaminaTuning& Tuning, float Stamina, bool bGalloping, float DeltaSeconds);
}
