// Stand-in for FStringView: a view of characters, which the engine's JSON accessors take for a field name. An FString
// and a character literal both convert to one.
#pragma once

#include "Containers/UnrealString.h"

#include <string>

class FStringView
{
public:
	FStringView(const FString& String) : Value(String.StandInValue()) {}
	FStringView(const TCHAR* Characters) : Value(Characters ? Characters : L"") {}
	const std::wstring& StandInValue() const { return Value; }
private:
	std::wstring Value;
};
