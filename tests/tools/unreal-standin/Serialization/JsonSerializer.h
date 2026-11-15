// Stand-in for FJsonSerializer::Deserialize: a small strict JSON parser that keeps objects and numbers.
#pragma once

#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"

#include <cwchar>
#include <memory>
#include <string>

class FJsonSerializer
{
public:
	/** Options, as Epic's API reference gives TJsonSerializer::EFlags. */
	enum EFlags
	{
		None = 0,
		StoreNumbersAsStrings = 1,
	};

	/**
	 * Read a JSON object from the reader's text. False, with OutObject untouched, when the text is not one JSON object.
	 * The signature is the one Epic's API reference gives, with no default arguments, since the reference prints none.
	 */
	static bool Deserialize(const TSharedRef<TJsonReader<TCHAR>>& Reader, TSharedPtr<FJsonObject>& OutObject, EFlags InOptions)
	{
		(void)InOptions;
		const std::wstring& Text = Reader->Text;
		size_t At = 0;
		std::shared_ptr<FJsonObject> Root = std::make_shared<FJsonObject>();
		if (!Object(Text, At, *Root)) return false;
		Space(Text, At);
		if (At != Text.size()) return false;
		OutObject = TSharedPtr<FJsonObject>(Root);
		return true;
	}

private:
	static void Space(const std::wstring& Text, size_t& At) { while (At < Text.size() && (Text[At] == ' ' || Text[At] == '\n' || Text[At] == '\r' || Text[At] == '\t')) ++At; }
	static bool Literal(const std::wstring& Text, size_t& At, const wchar_t* Word)
	{
		const std::wstring Expected(Word);
		if (Text.compare(At, Expected.size(), Expected) != 0) return false;
		At += Expected.size();
		return true;
	}
	static bool String(const std::wstring& Text, size_t& At, std::wstring& Out)
	{
		if (At >= Text.size() || Text[At] != '"') return false;
		for (++At; At < Text.size(); ++At)
		{
			const wchar_t Character = Text[At];
			if (Character == '"') { ++At; return true; }
			if (Character == '\\')
			{
				if (++At >= Text.size()) return false;
				const wchar_t Escaped = Text[At];
				if (Escaped == 'u') { if (At + 4 >= Text.size()) return false; At += 4; Out += L'?'; }
				else Out += Escaped == L'n' ? L'\n' : Escaped == L't' ? L'\t' : Escaped == L'r' ? L'\r' : Escaped == L'b' ? L'\b' : Escaped == L'f' ? L'\f' : Escaped;
			}
			else Out += Character;
		}
		return false;
	}
	static bool Number(const std::wstring& Text, size_t& At, double& Out)
	{
		const wchar_t* Start = Text.c_str() + At;
		wchar_t* End = nullptr;
		Out = std::wcstod(Start, &End);
		if (End == Start) return false;
		At += static_cast<size_t>(End - Start);
		return true;
	}
	/** Any value; an object or a number is handed back, anything else is read past. */
	static bool Value(const std::wstring& Text, size_t& At, std::shared_ptr<FJsonObject>& OutObject, double& OutNumber, bool& bIsNumber)
	{
		Space(Text, At);
		bIsNumber = false;
		if (At >= Text.size()) return false;
		const wchar_t Character = Text[At];
		if (Character == '{') { OutObject = std::make_shared<FJsonObject>(); return Object(Text, At, *OutObject); }
		if (Character == '[')
		{
			++At; Space(Text, At);
			if (At < Text.size() && Text[At] == ']') { ++At; return true; }
			for (;;)
			{
				std::shared_ptr<FJsonObject> Ignored; double IgnoredNumber = 0; bool bIgnored = false;
				if (!Value(Text, At, Ignored, IgnoredNumber, bIgnored)) return false;
				Space(Text, At);
				if (At < Text.size() && Text[At] == ',') { ++At; continue; }
				if (At < Text.size() && Text[At] == ']') { ++At; return true; }
				return false;
			}
		}
		if (Character == '"') { std::wstring Ignored; return String(Text, At, Ignored); }
		if (Character == 't') return Literal(Text, At, L"true");
		if (Character == 'f') return Literal(Text, At, L"false");
		if (Character == 'n') return Literal(Text, At, L"null");
		bIsNumber = Number(Text, At, OutNumber);
		return bIsNumber;
	}
	static bool Object(const std::wstring& Text, size_t& At, FJsonObject& Out)
	{
		Space(Text, At);
		if (At >= Text.size() || Text[At] != '{') return false;
		++At; Space(Text, At);
		if (At < Text.size() && Text[At] == '}') { ++At; return true; }
		for (;;)
		{
			Space(Text, At);
			std::wstring Key;
			if (!String(Text, At, Key)) return false;
			Space(Text, At);
			if (At >= Text.size() || Text[At] != ':') return false;
			++At;
			std::shared_ptr<FJsonObject> Child; double NumberValue = 0; bool bIsNumber = false;
			if (!Value(Text, At, Child, NumberValue, bIsNumber)) return false;
			if (Child) Out.Objects[Key] = TSharedPtr<FJsonObject>(Child);
			else if (bIsNumber) Out.Numbers[Key] = NumberValue;
			Space(Text, At);
			if (At < Text.size() && Text[At] == ',') { ++At; continue; }
			if (At < Text.size() && Text[At] == '}') { ++At; return true; }
			return false;
		}
	}
};
