// Stand-in for FPaths: the project folder (set by the test) and the few path operations the seed uses.
#pragma once

#include "CoreMinimal.h"

namespace StandIn
{
	/** The folder that holds the .uproject, with a trailing slash, as FPaths::ProjectDir gives it. */
	inline std::string& ProjectDir() { static std::string Directory; return Directory; }
}

class FPaths
{
public:
	static FString ProjectDir() { return FString(StandIn::ProjectDir()); }
	static bool IsRelative(const FString& Path)
	{
		const std::string& Value = Path.StandInValue();
		return !(Value.size() > 0 && (Value[0] == '/' || Value[0] == '\\')) && !(Value.size() > 1 && Value[1] == ':');
	}
	/** Join path parts with single slashes. */
	template <typename... Parts> static FString Combine(const Parts&... Pieces)
	{
		std::string Out;
		for (const FString& Piece : { FString(Pieces)... })
		{
			const std::string& Value = Piece.StandInValue();
			if (Value.empty()) continue;
			if (!Out.empty() && Out.back() != '/') Out += '/';
			Out += (!Out.empty() && Value[0] == '/') ? Value.substr(1) : Value;
		}
		return FString(Out);
	}
	/** Resolve "." and ".." parts; a relative path is taken from the working directory by the engine, and left as it is here. */
	static FString ConvertRelativePathToFull(const FString& Path)
	{
		const std::string& Value = Path.StandInValue();
		std::vector<std::string> Kept;
		size_t Start = 0;
		for (;;)
		{
			const size_t End = Value.find('/', Start);
			const std::string Part = Value.substr(Start, End == std::string::npos ? std::string::npos : End - Start);
			if (Part == "..") { if (!Kept.empty()) Kept.pop_back(); }
			else if (!Part.empty() && Part != ".") Kept.push_back(Part);
			if (End == std::string::npos) break;
			Start = End + 1;
		}
		std::string Out = Value.size() > 0 && Value[0] == '/' ? "/" : "";
		for (size_t Index = 0; Index < Kept.size(); ++Index) Out += (Index ? "/" : "") + Kept[Index];
		return FString(Out);
	}
};
