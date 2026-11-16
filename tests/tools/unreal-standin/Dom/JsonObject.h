// Stand-in for FJsonObject: the fields of a JSON object, of which the seed reads numbers and nested objects.
#pragma once

#include "Containers/StringView.h"
#include "Templates/SharedPointer.h"

#include <map>
#include <string>

class FJsonObject
{
public:
	/** The number in that field, or false when there is no such field or it is not a number. */
	bool TryGetNumberField(FStringView FieldName, double& OutNumber) const
	{
		const auto Found = Numbers.find(FieldName.StandInValue());
		if (Found == Numbers.end()) return false;
		OutNumber = Found->second;
		return true;
	}
	/** The object in that field, or false when there is no such field or it is not an object. */
	bool TryGetObjectField(FStringView FieldName, const TSharedPtr<FJsonObject>*& OutObject) const
	{
		const auto Found = Objects.find(FieldName.StandInValue());
		if (Found == Objects.end()) return false;
		OutObject = &Found->second;
		return true;
	}
	// Filled by the stand-in reader. Fields of other kinds (strings, arrays, booleans, null) are read and dropped.
	std::map<std::wstring, double> Numbers;
	std::map<std::wstring, TSharedPtr<FJsonObject>> Objects;
};
