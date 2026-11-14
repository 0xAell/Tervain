#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "TervainSettings.generated.h"

/**
 * Project settings for the Tervain module (Project Settings > Game > Tervain).
 *
 * The DataTable references are empty until the tables are imported from data/unreal: create a DataTable for each row
 * struct in TervainRows.h, import the JSON file of the same name, and point the matching setting at it.
 */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Tervain"))
class TERVAIN_API UTervainSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	/**
	 * The folder holding the exported game data: data/ in the repository. Relative paths are taken from the project
	 * folder, so the default finds it beside this project in the repository checkout.
	 */
	UPROPERTY(Config, EditAnywhere, Category = "Data")
	FString DataDirectory = TEXT("../data");

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath ItemsTable;

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath AnimalSpeciesTable;

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath AnimalsTable;

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath EnemyArchetypesTable;

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath EnemyPostsTable;

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath PlacesTable;

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath BuildingsTable;

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath ResidentsTable;

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath LooseCargoTable;

	UPROPERTY(Config, EditAnywhere, Category = "Data|Tables", meta = (AllowedClasses = "/Script/Engine.DataTable"))
	FSoftObjectPath TreesTable;

	/** DataDirectory as an absolute path. */
	FString GetDataDirectory() const;

	virtual FName GetCategoryName() const override { return FName(TEXT("Game")); }
};
