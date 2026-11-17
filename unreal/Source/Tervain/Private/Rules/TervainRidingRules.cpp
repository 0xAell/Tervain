#include "Rules/TervainRidingRules.h"

#include "Math/UnrealMathUtility.h"

namespace
{
	/** Which way a value points: 1, -1, or 0 for zero, as the core's Math.sign gives it. */
	int32 SignOf(float Value)
	{
		return Value > 0.f ? 1 : Value < 0.f ? -1 : 0;
	}
}

float TervainRules::SteerMount(FTervainRideMotion& Motion, const FTervainRideTuning& Tuning, float DirX, float DirZ, float Push, bool bGallop, float DeltaSeconds)
{
	float Target = 0.f, Turn = 0.f;
	const float Pace = FMath::Min(1.f, FMath::Abs(Motion.Speed) / Tuning.Run);
	const float MaxTurn = (Tuning.TurnStill + (Tuning.TurnRun - Tuning.TurnStill) * Pace) * DeltaSeconds;
	if (Push > 0.05f)
	{
		const float Wanted = FMath::Atan2(DirX, DirZ);
		const float Diff = FMath::Atan2(FMath::Sin(Wanted - Motion.Yaw), FMath::Cos(Wanted - Motion.Yaw));
		if (FMath::Abs(Diff) > Tuning.BackCone && Motion.Speed < 0.5f)
		{
			Target = -Tuning.Back * Push;
		}
		else
		{
			Turn = FMath::Max(-MaxTurn, FMath::Min(MaxTurn, Diff));
			Target = (bGallop ? Tuning.Run : Tuning.Walk) * Push * FMath::Max(0.25f, FMath::Cos(Diff));
		}
	}
	const bool bRising = FMath::Abs(Target) > FMath::Abs(Motion.Speed) && SignOf(Target) != -SignOf(Motion.Speed);
	const float Rate = (bRising ? Tuning.Accel : Tuning.Brake) * DeltaSeconds;
	Motion.Speed = Motion.Speed + FMath::Max(-Rate, FMath::Min(Rate, Target - Motion.Speed));
	Motion.Yaw = FMath::Atan2(FMath::Sin(Motion.Yaw + Turn), FMath::Cos(Motion.Yaw + Turn));
	return DeltaSeconds > 0.f ? Turn / DeltaSeconds : 0.f;
}

float TervainRules::MountStaminaStep(const FTervainMountStaminaTuning& Tuning, float Stamina, bool bGalloping, float DeltaSeconds)
{
	return bGalloping ? FMath::Max(0.f, Stamina - Tuning.Drain * DeltaSeconds) : FMath::Min(Tuning.Max, Stamina + Tuning.Recover * DeltaSeconds);
}
