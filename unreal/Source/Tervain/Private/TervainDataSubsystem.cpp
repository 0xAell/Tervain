#include "TervainDataSubsystem.h"

#include "Containers/Array.h"
#include "Dom/JsonObject.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Templates/Casts.h"
#include "Tervain.h"
#include "TervainSettings.h"
#include "UObject/ObjectMacros.h"
#include "UObject/UObjectGlobals.h"

void UTervainDataSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// The settings' tables, loaded now and held in Tables, in the order of the indices declared beside it.
	const UTervainSettings* Settings = GetDefault<UTervainSettings>();
	const struct { const TCHAR* Name; const FSoftObjectPath& Path; } Named[] = {
		{ TEXT("Items Table"), Settings->ItemsTable },
		{ TEXT("Animal Species Table"), Settings->AnimalSpeciesTable },
		{ TEXT("Animals Table"), Settings->AnimalsTable },
		{ TEXT("Enemy Archetypes Table"), Settings->EnemyArchetypesTable },
		{ TEXT("Enemy Posts Table"), Settings->EnemyPostsTable },
		{ TEXT("Places Table"), Settings->PlacesTable },
		{ TEXT("Buildings Table"), Settings->BuildingsTable },
		{ TEXT("Residents Table"), Settings->ResidentsTable },
		{ TEXT("Loose Cargo Table"), Settings->LooseCargoTable },
		{ TEXT("Trees Table"), Settings->TreesTable },
	};
	for (const auto& Entry : Named)
	{
		UDataTable* Table = LoadTable(Entry.Path);
		if (Table == nullptr && !Entry.Path.IsNull())
		{
			UE_LOG(LogTervain, Warning, TEXT("The table set as %s in Project Settings > Game > Tervain could not be loaded."), Entry.Name);
		}
		Tables.Add(Table);
	}

	const FString File = FPaths::Combine(GetDefault<UTervainSettings>()->GetDataDirectory(), TEXT("game"), TEXT("tuning.json"));
	FString Text;
	// Every parameter Epic's API reference gives is passed: the reference prints no default arguments. The read flag is
	// named in full and cast, which compiles whether EFileRead is a scoped enum or not; the reference does not say.
	if (!FFileHelper::LoadFileToString(Text, *File, FFileHelper::EHashOptions::None, static_cast<uint32>(EFileRead::FILEREAD_None)))
	{
		UE_LOG(LogTervain, Warning, TEXT("Tuning values not found at %s. Set the data directory in Project Settings > Game > Tervain."), *File);
		return;
	}

	const TSharedRef<TJsonReader<TCHAR>> Reader = TJsonReaderFactory<TCHAR>::Create(Text);
	if (!FJsonSerializer::Deserialize(Reader, Tuning, FJsonSerializer::EFlags::None) || !Tuning.IsValid())
	{
		UE_LOG(LogTervain, Error, TEXT("%s is not valid JSON."), *File);
		Tuning.Reset();
	}
}

float UTervainDataSubsystem::GetTuningNumber(const FString& Path, float Default) const
{
	TArray<FString> Parts;
	Path.ParseIntoArray(Parts, TEXT("."), true);

	TSharedPtr<FJsonObject> Object = Tuning;
	for (int32 Index = 0; Object.IsValid() && Index < Parts.Num(); ++Index)
	{
		if (Index == Parts.Num() - 1)
		{
			double Value = 0.0;
			return Object->TryGetNumberField(Parts[Index], Value) ? static_cast<float>(Value) : Default;
		}

		const TSharedPtr<FJsonObject>* Child = nullptr;
		if (!Object->TryGetObjectField(Parts[Index], Child) || Child == nullptr)
		{
			return Default;
		}
		Object = *Child;
	}
	return Default;
}

FTervainStaminaTuning UTervainDataSubsystem::GetStaminaTuning() const
{
	FTervainStaminaTuning Out;
	Out.Max = GetTuningNumber(TEXT("hero.stamina.max"));
	Out.SprintPerSecond = GetTuningNumber(TEXT("hero.stamina.sprintPerSecond"));
	Out.SprintMin = GetTuningNumber(TEXT("hero.stamina.sprintMin"));
	Out.SwimSprintPerSecond = GetTuningNumber(TEXT("hero.stamina.swimSprintPerSecond"));
	Out.Regen = GetTuningNumber(TEXT("hero.stamina.regen"));
	Out.RegenWinded = GetTuningNumber(TEXT("hero.stamina.regenWinded"));
	Out.RegenGuarding = GetTuningNumber(TEXT("hero.stamina.regenGuarding"));
	Out.RecoverAbove = GetTuningNumber(TEXT("hero.stamina.recoverAbove"));
	Out.PauseAfterSprint = GetTuningNumber(TEXT("hero.stamina.pauseAfterSprint"));
	return Out;
}

FTervainGuardTuning UTervainDataSubsystem::GetGuardTuning() const
{
	FTervainGuardTuning Out;
	Out.BlockCost = GetTuningNumber(TEXT("hero.actionCost.blockHit"));
	Out.SteadyGuard = GetTuningNumber(TEXT("hero.guard.steadyGuard"));
	Out.HeavyCost = GetTuningNumber(TEXT("hero.guard.heavyCost"));
	Out.TiredBelow = GetTuningNumber(TEXT("hero.guard.tiredBelow"));
	Out.PerfectBlockWindow = GetTuningNumber(TEXT("hero.perfectBlockWindow"));
	return Out;
}

UDataTable* UTervainDataSubsystem::LoadTable(const FSoftObjectPath& Path)
{
	return Path.IsNull() ? nullptr : Cast<UDataTable>(Path.TryLoad(nullptr, LOAD_None));
}

const UDataTable* UTervainDataSubsystem::HeldTable(int32 Index) const
{
	if (Index < 0 || Index >= Tables.Num())
	{
		return nullptr;
	}
	const UDataTable* Table = Tables[Index];
	return Table;
}

const FTervainItemRow* UTervainDataSubsystem::FindItem(FName ItemId) const
{
	const UDataTable* Table = HeldTable(ItemsIndex);
	return Table ? Table->FindRow<FTervainItemRow>(ItemId, TEXT("UTervainDataSubsystem::FindItem"), false) : nullptr;
}

const FTervainResidentRow* UTervainDataSubsystem::FindResident(FName RoleId) const
{
	const UDataTable* Table = HeldTable(ResidentsIndex);
	return Table ? Table->FindRow<FTervainResidentRow>(RoleId, TEXT("UTervainDataSubsystem::FindResident"), false) : nullptr;
}
