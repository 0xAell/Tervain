// Stand-in for FString.
#pragma once

#include "Containers/Array.h"
#include "CoreMinimal.h"

#include <string>

namespace StandIn
{
	/** UTF-8 bytes as TCHARs, and back: the stand-ins read and print UTF-8, the strings hold TCHARs. */
	inline std::wstring Widen(const std::string& Bytes)
	{
		std::wstring Out;
		for (size_t At = 0; At < Bytes.size();)
		{
			const unsigned char Lead = static_cast<unsigned char>(Bytes[At]);
			const int Count = Lead < 0x80 ? 1 : (Lead >> 5) == 0x6 ? 2 : (Lead >> 4) == 0xE ? 3 : (Lead >> 3) == 0x1E ? 4 : 1;
			unsigned int Code = Count == 1 ? Lead : Lead & (0xFF >> (Count + 1));
			for (int Next = 1; Next < Count && At + Next < Bytes.size(); ++Next) Code = (Code << 6) | (static_cast<unsigned char>(Bytes[At + Next]) & 0x3F);
			Out += static_cast<wchar_t>(Code);
			At += Count;
		}
		return Out;
	}
	inline std::string Narrow(const std::wstring& Characters)
	{
		std::string Out;
		for (const wchar_t Character : Characters)
		{
			const unsigned int Code = static_cast<unsigned int>(Character);
			if (Code < 0x80) Out += static_cast<char>(Code);
			else if (Code < 0x800) { Out += static_cast<char>(0xC0 | (Code >> 6)); Out += static_cast<char>(0x80 | (Code & 0x3F)); }
			else if (Code < 0x10000) { Out += static_cast<char>(0xE0 | (Code >> 12)); Out += static_cast<char>(0x80 | ((Code >> 6) & 0x3F)); Out += static_cast<char>(0x80 | (Code & 0x3F)); }
			else { Out += static_cast<char>(0xF0 | (Code >> 18)); Out += static_cast<char>(0x80 | ((Code >> 12) & 0x3F)); Out += static_cast<char>(0x80 | ((Code >> 6) & 0x3F)); Out += static_cast<char>(0x80 | (Code & 0x3F)); }
		}
		return Out;
	}
}

/** A string of TCHARs; `*String` gives its characters, as in the engine. */
class FString
{
public:
	FString() = default;
	FString(const TCHAR* Characters) : Value(Characters ? Characters : L"") {}
	explicit FString(const std::wstring& InValue) : Value(InValue) {}
	const TCHAR* operator*() const { return Value.c_str(); }
	bool IsEmpty() const { return Value.empty(); }
	/** Split at each occurrence of a delimiter; with InCullEmpty, empty pieces are dropped. Returns the count. */
	int32 ParseIntoArray(TArray<FString>& OutArray, const TCHAR* Delimiter, bool InCullEmpty) const
	{
		OutArray.StandInClear();
		const std::wstring Separator(Delimiter);
		size_t Start = 0;
		for (;;)
		{
			const size_t End = Value.find(Separator, Start);
			const std::wstring Piece = Value.substr(Start, End == std::wstring::npos ? std::wstring::npos : End - Start);
			if (!Piece.empty() || !InCullEmpty) OutArray.Add(FString(Piece));
			if (End == std::wstring::npos) break;
			Start = End + Separator.size();
		}
		return OutArray.Num();
	}
	const std::wstring& StandInValue() const { return Value; }
private:
	std::wstring Value;
};
