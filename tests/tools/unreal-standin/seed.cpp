// Builds every source file of the Unreal seed against the stand-ins in this folder and runs it: the data subsystem
// reads the repository's exported tuning file, the settings resolve the data folder, and the row structs are made and
// found in a table. Driven by tests/tools/unrealSeedBuild.test.ts; each mode prints one value per line.
#include "Misc/Paths.h"
#include "Modules/ModuleManager.h"
#include "Tervain.h"
#include "TervainDataSubsystem.h"
#include "TervainSettings.h"
#include "TervainUnits.h"
#include "UObject/NameTypes.h"
#include "UObject/SoftObjectPath.h"
#include "UObject/UObjectGlobals.h"

#include <iostream>
#include <string>

FDefaultGameModuleImpl* StandInModule_Tervain();
const char* StandInGameName_Tervain();

static void PrintLog()
{
	for (const std::string& Line : StandIn::LogLines()) std::printf("log %s\n", Line.c_str());
}

int main(int Count, char** Arguments)
{
	if (Count < 3) return 2;
	const std::string Mode = Arguments[1];
	StandIn::ProjectDir() = StandIn::Widen(Arguments[2]);
	if (Count > 3) StandIn::MutableDefault<UTervainSettings>()->DataDirectory = FString(StandIn::Widen(Arguments[3]));

	UTervainDataSubsystem Data;
	FSubsystemCollectionBase Collection;
	Data.Initialize(Collection);

	if (Mode == "tuning")
	{
		// One dotted path per line on standard input; a path that names no number prints the default given here.
		std::printf("%d\n", Data.HasTuning() ? 1 : 0);
		std::string Line;
		while (std::getline(std::cin, Line)) std::printf("%.9g\n", Data.GetTuningNumber(FString(StandIn::Widen(Line)), -12345.f));
	}
	else if (Mode == "structs")
	{
		const FTervainStaminaTuning Stamina = Data.GetStaminaTuning();
		std::printf("%.9g %.9g %.9g %.9g %.9g %.9g %.9g %.9g %.9g\n", Stamina.Max, Stamina.SprintPerSecond, Stamina.SprintMin, Stamina.SwimSprintPerSecond,
			Stamina.Regen, Stamina.RegenWinded, Stamina.RegenGuarding, Stamina.RecoverAbove, Stamina.PauseAfterSprint);
		const FTervainGuardTuning Guard = Data.GetGuardTuning();
		std::printf("%.9g %.9g %.9g %.9g %.9g\n", Guard.BlockCost, Guard.SteadyGuard, Guard.HeavyCost, Guard.TiredBelow, Guard.PerfectBlockWindow);
		// The mirrored rules on the values the subsystem read: a second of running from a full meter, and a heavy blow on a fresh fist guard.
		FTervainStaminaState State;
		State.Stamina = Stamina.Max;
		const bool bWinded = TervainRules::StaminaStep(State, Stamina, 1.f, ETervainStaminaDrain::Run, false);
		std::printf("%d %.9g %.9g\n", bWinded ? 1 : 0, State.Stamina, State.Pause);
		FTervainGuardArms Fists;
		Fists.FreshShare = 0.6f; Fists.TiredShare = 0.85f; Fists.PerfectShare = 0.35f;
		const FTervainGuardedHit Hit = TervainRules::ResolveGuardedHit(Guard, Fists, 20, true, 0.5f, 100.f, false);
		std::printf("%d %d %.9g %.9g %d\n", Hit.bParried ? 1 : 0, Hit.Damage, Hit.Cost, Hit.Stamina, Hit.bGuardBroken ? 1 : 0);
	}
	else if (Mode == "settings")
	{
		const UTervainSettings* Settings = GetDefault<UTervainSettings>();
		std::printf("%s\n%s\n%s\n%d\n%d\n", StandIn::Narrow(Settings->GetCategoryName().StandInValue()).c_str(), StandIn::Narrow(Settings->GetDataDirectory().StandInValue()).c_str(), StandInGameName_Tervain(),
			StandInModule_Tervain() != nullptr ? 1 : 0, Data.HasTuning() ? 1 : 0);
	}
	else if (Mode == "rows")
	{
		// No table is set: nothing is found, and nothing is loaded.
		std::printf("%d\n", Data.FindItem(FName(TEXT("bread"))) == nullptr ? 1 : 0);

		// A table of items where the settings point: a row is found by name as its own struct.
		UDataTable Items;
		FTervainItemRow Bread;
		Bread.NameKey = TEXT("item.bread");
		Bread.Kind = ETervainItemKind::Consumable;
		Bread.HealAmount = 12;
		Bread.Action = ETervainItemAction::Consume;
		Items.StandInAddRow(TEXT("bread"), &Bread);
		StandIn::Objects()[TEXT("/Game/Tervain/Data/DT_Items.DT_Items")] = &Items;
		StandIn::MutableDefault<UTervainSettings>()->ItemsTable = FSoftObjectPath(TEXT("/Game/Tervain/Data/DT_Items.DT_Items"));
		const FTervainItemRow* Found = Data.FindItem(FName(TEXT("bread")));
		std::printf("%d %s %d %d\n", Found == &Bread ? 1 : 0, Found ? StandIn::Narrow(Found->NameKey.StandInValue()).c_str() : "", Found ? Found->HealAmount : -1, Found && Found->Kind == ETervainItemKind::Consumable ? 1 : 0);
		std::printf("%d\n", Data.FindItem(FName(TEXT("no-such-item"))) == nullptr ? 1 : 0);
		// Names compare without regard to case, as the engine's do: the row "bread" answers to "Bread".
		std::printf("%d %d\n", Data.FindItem(FName(TEXT("Bread"))) == &Bread ? 1 : 0, FName(TEXT("BREAD")) == FName(TEXT("bread")) ? 1 : 0);

		// A path with nothing behind it, and a table whose rows are of another struct, give null rather than a wrong row.
		StandIn::MutableDefault<UTervainSettings>()->ResidentsTable = FSoftObjectPath(TEXT("/Game/Tervain/Data/DT_Missing.DT_Missing"));
		std::printf("%d\n", Data.FindResident(FName(TEXT("mara"))) == nullptr ? 1 : 0);
		StandIn::MutableDefault<UTervainSettings>()->ResidentsTable = FSoftObjectPath(TEXT("/Game/Tervain/Data/DT_Items.DT_Items"));
		std::printf("%d\n", Data.FindResident(FName(TEXT("bread"))) == nullptr ? 1 : 0);

		// Every generated row struct is a complete type that can be made, and a resident's schedule holds entries.
		FTervainAnimalSpeciesRow Species; FTervainAnimalRow Animal; FTervainEnemyArchetypeRow Archetype; FTervainEnemyPostRow Post; FTervainPlaceRow Place;
		FTervainBuildingRow Building; FTervainResidentRow Resident; FTervainLooseCargoRow Cargo; FTervainTreeRow Tree;
		FTervainScheduleEntry Entry;
		Resident.Schedule.Add(Entry);
		const FTableRowBase* Rows[] = { &Bread, &Species, &Animal, &Archetype, &Post, &Place, &Building, &Resident, &Cargo, &Tree };
		std::printf("%d %d\n", static_cast<int>(sizeof(Rows) / sizeof(Rows[0])), Resident.Schedule.Num());
	}
	else return 2;

	PrintLog();
	return 0;
}
