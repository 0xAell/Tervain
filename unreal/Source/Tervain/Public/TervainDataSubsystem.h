#pragma once

#include "CoreMinimal.h"
#include "Containers/Array.h"
#include "Containers/UnrealString.h"
#include "Engine/DataTable.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Templates/SharedPointer.h"
#include "UObject/NameTypes.h"
#include "UObject/ObjectPtr.h"
#include "UObject/SoftObjectPath.h"
#include "Data/TervainRows.h"
#include "Rules/TervainBowRules.h"
#include "Rules/TervainHeroRules.h"
#include "Rules/TervainRidingRules.h"
#include "TervainDataSubsystem.generated.h"

class FJsonObject;

/**
 * The game's data at runtime: the imported DataTables named in the project settings, and the tuning values read from
 * data/game/tuning.json as exported by the web repository's core.
 *
 * Every table the settings name is loaded once, when the subsystem starts, and held for as long as it lives: a row
 * found in a table points into that table, so the table must not be unloaded while the row is in use, and no lookup
 * should load a table in the middle of play.
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

	/** How water slows the legs, read from "hero.wade". */
	UFUNCTION(BlueprintPure, Category = "Tervain|Data")
	FTervainWadeTuning GetWadeTuning() const;

	/** How an arrow leaves the string and falls, read from "bow". */
	UFUNCTION(BlueprintPure, Category = "Tervain|Data")
	FTervainBowTuning GetBowTuning() const;

	/** How the deer answers the reins, read from "riding.ride". */
	UFUNCTION(BlueprintPure, Category = "Tervain|Data")
	FTervainRideTuning GetRideTuning() const;

	/** The gallop's stamina, read from "riding.stamina". */
	UFUNCTION(BlueprintPure, Category = "Tervain|Data")
	FTervainMountStaminaTuning GetMountStaminaTuning() const;

	/** An item's row, or null when the items table is not set, could not be loaded or has no such row. */
	const FTervainItemRow* FindItem(FName ItemId) const;

	/** A resident's row by role id, or null. */
	const FTervainResidentRow* FindResident(FName RoleId) const;

private:
	/** The order in which Initialize loads the settings' tables into Tables. */
	static constexpr int32 ItemsIndex = 0;
	static constexpr int32 ResidentsIndex = 7;

	/** The asset at a path, loaded if need be; null when the path is unset or holds no DataTable. */
	static UDataTable* LoadTable(const FSoftObjectPath& Path);

	/** A table Initialize loaded, by its index; null when the setting was unset or the table could not be loaded. */
	const UDataTable* HeldTable(int32 Index) const;

	/**
	 * The ten tables the settings name, in the order Initialize loads them, null where one is unset or missing. Epic: "you
	 * typically need to maintain a UPROPERTY reference to any Object you wish to keep alive"; a table held only by a raw
	 * pointer could be collected while a row found in it is still in use.
	 */
	UPROPERTY(Transient)
	TArray<TObjectPtr<UDataTable>> Tables;

	TSharedPtr<FJsonObject> Tuning;
};
