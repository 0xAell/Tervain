#include "TervainDataSubsystem.h"

#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Tervain.h"
#include "TervainSettings.h"

void UTervainDataSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const FString File = FPaths::Combine(GetDefault<UTervainSettings>()->GetDataDirectory(), TEXT("game"), TEXT("tuning.json"));
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *File))
	{
		UE_LOG(LogTervain, Warning, TEXT("Tuning values not found at %s. Set the data directory in Project Settings > Game > Tervain."), *File);
		return;
	}

	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
	if (!FJsonSerializer::Deserialize(Reader, Tuning) || !Tuning.IsValid())
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

UDataTable* UTervainDataSubsystem::LoadTable(const FSoftObjectPath& Path) const
{
	return Path.IsNull() ? nullptr : Cast<UDataTable>(Path.TryLoad());
}

const FTervainItemRow* UTervainDataSubsystem::FindItem(FName ItemId) const
{
	const UDataTable* Table = LoadTable(GetDefault<UTervainSettings>()->ItemsTable);
	return Table ? Table->FindRow<FTervainItemRow>(ItemId, TEXT("UTervainDataSubsystem::FindItem"), false) : nullptr;
}

const FTervainResidentRow* UTervainDataSubsystem::FindResident(FName RoleId) const
{
	const UDataTable* Table = LoadTable(GetDefault<UTervainSettings>()->ResidentsTable);
	return Table ? Table->FindRow<FTervainResidentRow>(RoleId, TEXT("UTervainDataSubsystem::FindResident"), false) : nullptr;
}
