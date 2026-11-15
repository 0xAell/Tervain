// Stand-in for UDeveloperSettings: a settings object with a category name.
#pragma once

#include "UObject/StandInObject.h"

class UDeveloperSettings : public UObject
{
public:
	virtual FName GetCategoryName() const { return FName(TEXT("General")); }
};
