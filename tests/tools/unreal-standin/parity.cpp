// Runs the seed's mirrored rules and unit conversions on cases read from standard input, one per line, and prints
// one line of results for each. Driven by tests/tools/unrealRulesParity.test.ts.
#include "Rules/TervainBowRules.h"
#include "Rules/TervainHeroRules.h"
#include "TervainUnits.h"

#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>

int main()
{
	FTervainStaminaTuning Stamina;
	FTervainGuardTuning Guard;
	FTervainGuardArms Arms[2];
	FTervainWadeTuning Wade;
	FTervainBowTuning Bow;
	std::string Line;
	while (std::getline(std::cin, Line))
	{
		std::istringstream In(Line);
		std::string Kind;
		In >> Kind;
		if (Kind == "stamina-tuning")
		{
			In >> Stamina.Max >> Stamina.SprintPerSecond >> Stamina.SprintMin >> Stamina.SwimSprintPerSecond >> Stamina.Regen >> Stamina.RegenWinded
				>> Stamina.RegenGuarding >> Stamina.RecoverAbove >> Stamina.PauseAfterSprint;
		}
		else if (Kind == "guard-tuning")
		{
			In >> Guard.BlockCost >> Guard.SteadyGuard >> Guard.HeavyCost >> Guard.TiredBelow >> Guard.PerfectBlockWindow;
		}
		else if (Kind == "arms")
		{
			int Index = 0, Parries = 0;
			In >> Index;
			In >> Arms[Index].FreshShare >> Arms[Index].TiredShare >> Arms[Index].PerfectShare >> Parries;
			Arms[Index].bPerfectParries = Parries != 0;
		}
		else if (Kind == "stamina")
		{
			FTervainStaminaState State;
			int Exhausted = 0, Drain = 0, Guarding = 0;
			float DeltaSeconds = 0.f;
			In >> State.Stamina >> State.Pause >> Exhausted >> DeltaSeconds >> Drain >> Guarding;
			State.bExhausted = Exhausted != 0;
			const bool bWinded = TervainRules::StaminaStep(State, Stamina, DeltaSeconds, static_cast<ETervainStaminaDrain>(Drain), Guarding != 0);
			std::printf("%d %.9g %.9g %d\n", bWinded ? 1 : 0, State.Stamina, State.Pause, State.bExhausted ? 1 : 0);
		}
		else if (Kind == "guard")
		{
			int Index = 0, Damage = 0, Heavy = 0, Steady = 0;
			float BlockSeconds = 0.f, Meter = 0.f;
			In >> Index >> Damage >> Heavy >> BlockSeconds >> Meter >> Steady;
			const FTervainGuardedHit Hit = TervainRules::ResolveGuardedHit(Guard, Arms[Index], Damage, Heavy != 0, BlockSeconds, Meter, Steady != 0);
			std::printf("%d %d %.9g %.9g %d\n", Hit.bParried ? 1 : 0, Hit.Damage, Hit.Cost, Hit.Stamina, Hit.bGuardBroken ? 1 : 0);
		}
		else if (Kind == "wade-tuning")
		{
			In >> Wade.From >> Wade.Span >> Wade.Slowest;
		}
		else if (Kind == "wade")
		{
			float Depth = 0.f;
			In >> Depth;
			std::printf("%.9g\n", TervainRules::WadeFactor(Wade, Depth));
		}
		else if (Kind == "bow-tuning")
		{
			In >> Bow.ArrowSpeed >> Bow.Gravity;
		}
		else if (Kind == "bow")
		{
			double X = 0, Y = 0, Z = 0;
			In >> X >> Y >> Z;
			const FVector Direction = TervainRules::ArrowLaunchDirection(Bow, FVector(X, Y, Z));
			std::printf("%.17g %.17g %.17g\n", Direction.X, Direction.Y, Direction.Z);
		}
		else if (Kind == "position")
		{
			double X = 0, Y = 0, Z = 0;
			In >> X >> Y >> Z;
			const FVector Out = TervainUnits::CoreToUnreal(X, Y, Z), Back = TervainUnits::UnrealToCore(Out);
			std::printf("%.9g %.9g %.9g %.9g %.9g %.9g\n", Out.X, Out.Y, Out.Z, Back.X, Back.Y, Back.Z);
		}
		else if (Kind == "yaw")
		{
			float Yaw = 0.f;
			In >> Yaw;
			const float Forward = TervainUnits::CoreYawToUnreal(Yaw);
			std::printf("%.9g %.9g %.9g %.9g\n", Forward, TervainUnits::CoreYawToUnrealForImportedGltf(Yaw), TervainUnits::UnrealYawToCore(Forward), TervainUnits::MetresToUnreal(Yaw));
		}
	}
	return 0;
}
