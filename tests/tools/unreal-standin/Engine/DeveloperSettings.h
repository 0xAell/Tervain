// Stand-in for UDeveloperSettings: a settings object with a category name.
#pragma once

#include "UObject/NameTypes.h"
#include "UObject/Object.h"

class UDeveloperSettings : public UObject
{
public:
	/** The settings section's category. The seed overrides it; what the engine's own returns is not assumed here. */
	virtual FName GetCategoryName() const { return FName(); }
};
