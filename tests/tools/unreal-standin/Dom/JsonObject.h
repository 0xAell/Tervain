// Stand-in for FJsonObject: the fields of a JSON object, of which the seed reads numbers and nested objects.
#pragma once

#include "CoreMinimal.h"

class FJsonObject
{
public:
	/** The number in that field, or false when there is no such field or it is not a number. */
	bool TryGetNumberField(const FString& FieldName, double& OutNumber) const
	{
		const auto Found = Numbers.find(FieldName.StandInValue());
		if (Found == Numbers.end()) return false;
		OutNumber = Found->second;
		return true;
	}
	/** The object in that field, or false when there is no such field or it is not an object. */
	bool TryGetObjectField(const FString& FieldName, const TSharedPtr<FJsonObject>*& OutObject) const
	{
		const auto Found = Objects.find(FieldName.StandInValue());
		if (Found == Objects.end()) return false;
		OutObject = &Found->second;
		return true;
	}
	// Filled by the stand-in reader. Fields of other kinds (strings, arrays, booleans, null) are read and dropped.
	std::map<std::string, double> Numbers;
	std::map<std::string, TSharedPtr<FJsonObject>> Objects;
};
