// Stand-in for FPaths: the project folder (set by the test) and the few path operations the seed uses.
#pragma once

#include "Containers/UnrealString.h"

#include <string>
#include <vector>

namespace StandIn
{
	/** The folder that holds the .uproject, as a test sets it. The seed relies only on its being the project's base directory. */
	inline std::wstring& ProjectDir() { static std::wstring Directory; return Directory; }
}

class FPaths
{
public:
	static FString ProjectDir() { return FString(StandIn::ProjectDir()); }
	static bool IsRelative(const FString& Path)
	{
		const std::wstring& Value = Path.StandInValue();
		return !(Value.size() > 0 && (Value[0] == L'/' || Value[0] == L'\\')) && !(Value.size() > 1 && Value[1] == L':');
	}
	/** Join path parts with single slashes. */
	template <typename... Parts> static FString Combine(const Parts&... Pieces)
	{
		std::wstring Out;
		for (const FString& Piece : { FString(Pieces)... })
		{
			const std::wstring& Value = Piece.StandInValue();
			if (Value.empty()) continue;
			if (!Out.empty() && Out.back() != L'/') Out += L'/';
			Out += (!Out.empty() && Value[0] == L'/') ? Value.substr(1) : Value;
		}
		return FString(Out);
	}
	/** Resolve "." and ".." parts. The engine takes a relative path from the process's base directory; here it is left relative. */
	static FString ConvertRelativePathToFull(const FString& Path)
	{
		const std::wstring& Value = Path.StandInValue();
		std::vector<std::wstring> Kept;
		size_t Start = 0;
		for (;;)
		{
			const size_t End = Value.find(L'/', Start);
			const std::wstring Part = Value.substr(Start, End == std::wstring::npos ? std::wstring::npos : End - Start);
			if (Part == L"..") { if (!Kept.empty()) Kept.pop_back(); }
			else if (!Part.empty() && Part != L".") Kept.push_back(Part);
			if (End == std::wstring::npos) break;
			Start = End + 1;
		}
		std::wstring Out = Value.size() > 0 && Value[0] == L'/' ? L"/" : L"";
		for (size_t Index = 0; Index < Kept.size(); ++Index) Out += (Index ? L"/" : L"") + Kept[Index];
		return FString(Out);
	}
};
