// Stand-in for FName.
#pragma once

#include "CoreMinimal.h"

#include <algorithm>
#include <cwctype>
#include <string>

/**
 * A name, over TCHARs. As in the engine, names compare without regard to case ("FNames are case-insensitive");
 * StandInKey gives the form two equal names share, for the stand-ins that look a name up.
 */
class FName
{
public:
	FName() = default;
	FName(const TCHAR* Characters) : Value(Characters ? Characters : L"") {}
	bool operator==(const FName& Other) const { return StandInKey() == Other.StandInKey(); }
	std::wstring StandInKey() const
	{
		std::wstring Key = Value;
		std::transform(Key.begin(), Key.end(), Key.begin(), [](wchar_t Character) { return static_cast<wchar_t>(std::towlower(static_cast<std::wint_t>(Character))); });
		return Key;
	}
	const std::wstring& StandInValue() const { return Value; }
private:
	std::wstring Value;
};
