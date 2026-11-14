#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Data/TervainRows.h"
#include "Rules/TervainHeroRules.h"
#include "TervainDataSubsystem.generated.h"

class FJsonObject;

/**
 * The game's data at runtime: the imported DataTables named in the project settings, and the tuning values read from
 * data/game/tuning.json as exported by the web repository's core.
 */
UCLASS()
class TERVAIN_API UTervainDataSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/** Whether tuning.json was found and read. */
	UFUNCTION(BlueprintPure, Category = "Tervain|Data")
	bool HasTuning() const { return Tuning.IsValid(); }

	/**
	 * A number from data/game/tuning.json by dotted path, in the core's units (metres, seconds, radians).
	 * For example "hero.stamina.regen" or "bow.arrowSpeed". Returns Default when the path names no number.
	 */
	UFUNCTION(BlueprintPure, Category = "Tervain|Data")
	float GetTuningNumber(const FString& Path, float Default = 0.f) const;

	/** The stamina meter's values, read from "hero.stamina". */
	UFUNCTION(BlueprintPure, Category = "Tervain|Data")
	FTervainStaminaTuning GetStaminaTuning() const;

	/** The guard's values, read from "hero.guard", "hero.actionCost" and "hero.perfectBlockWindow". */
	UFUNCTION(BlueprintPure, Category = "Tervain|Data")
	FTervainGuardTuning GetGuardTuning() const;

	/** An item's row, or null when the items table is not set or has no such row. */
	const FTervainItemRow* FindItem(FName ItemId) const;

	/** A resident's row by role id, or null. */
	const FTervainResidentRow* FindResident(FName RoleId) const;

	/** A table named in the project settings, loaded on first use; null when unset. */
	UDataTable* LoadTable(const FSoftObjectPath& Path) const;

private:
	TSharedPtr<FJsonObject> Tuning;
};
