// Stand-in for the JSON reader: it holds the text to read.
#pragma once

#include "Containers/UnrealString.h"
#include "Templates/SharedPointer.h"

#include <memory>
#include <string>

template <class CharType = TCHAR> class TJsonReader
{
public:
	explicit TJsonReader(const FString& InText) : Text(InText.StandInValue()) {}
	std::basic_string<CharType> Text;
};

template <class CharType = TCHAR> class TJsonReaderFactory
{
public:
	static TSharedRef<TJsonReader<CharType>> Create(const FString& JsonString)
	{
		return TSharedRef<TJsonReader<CharType>>(std::make_shared<TJsonReader<CharType>>(JsonString));
	}
};
