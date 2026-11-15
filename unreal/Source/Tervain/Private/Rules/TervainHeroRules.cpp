#include "Rules/TervainHeroRules.h"

#include "Math/UnrealMathUtility.h"

bool TervainRules::StaminaStep(FTervainStaminaState& State, const FTervainStaminaTuning& Tuning, float DeltaSeconds, ETervainStaminaDrain Drain, bool bGuarding)
{
	bool bWinded = false;
	if (Drain != ETervainStaminaDrain::None)
	{
		const float PerSecond = Drain == ETervainStaminaDrain::Swim ? Tuning.SwimSprintPerSecond : Tuning.SprintPerSecond;
		State.Stamina = FMath::Max(0.f, State.Stamina - PerSecond * DeltaSeconds);
		State.Pause = Tuning.PauseAfterSprint;
		if (State.Stamina <= Tuning.SprintMin)
		{
			State.bExhausted = true;
			bWinded = true;
		}
	}
	else if (State.Pause <= 0.f)
	{
		const float PerSecond = bGuarding ? Tuning.RegenGuarding : State.bExhausted ? Tuning.RegenWinded : Tuning.Regen;
		State.Stamina = FMath::Min(Tuning.Max, State.Stamina + PerSecond * DeltaSeconds);
	}

	if (State.bExhausted && State.Stamina > Tuning.RecoverAbove)
	{
		State.bExhausted = false;
	}
	return bWinded;
}

FTervainGuardedHit TervainRules::ResolveGuardedHit(const FTervainGuardTuning& Tuning, const FTervainGuardArms& Arms, int32 Damage, bool bHeavy, float BlockSeconds, float Stamina, bool bSteadyGuard)
{
	FTervainGuardedHit Out;
	const bool bPerfect = BlockSeconds < Tuning.PerfectBlockWindow;
	if (bPerfect && Arms.bPerfectParries)
	{
		Out.bParried = true;
		Out.Stamina = Stamina;
		return Out;
	}

	Out.Cost = Tuning.BlockCost * (bSteadyGuard ? Tuning.SteadyGuard : 1.f) * (bHeavy ? Tuning.HeavyCost : 1.f);
	const bool bTired = Stamina < Out.Cost * Tuning.TiredBelow;
	const float Share = bPerfect ? Arms.PerfectShare : bTired ? Arms.TiredShare : Arms.FreshShare;
	Out.Damage = FMath::RoundToInt32(static_cast<float>(Damage) * Share);
	Out.Stamina = FMath::Max(0.f, Stamina - Out.Cost);
	Out.bGuardBroken = Out.Stamina <= 0.f && bHeavy;
	return Out;
}
